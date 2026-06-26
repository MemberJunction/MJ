/**************************************************************************************************
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
 **************************************************************************************************/

-- ============================================================================
-- 1. MLAlgorithm (MJ: ML Algorithms) — curated algorithm catalog
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLAlgorithm] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [ProblemTypes] NVARCHAR(100) NOT NULL,
    [DriverClass] NVARCHAR(255) NOT NULL,
    [HyperparameterSchema] NVARCHAR(MAX) NULL,
    [DefaultHyperparameters] NVARCHAR(MAX) NULL,
    [SupportsFeatureImportance] BIT NOT NULL DEFAULT 1,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT [PK_MLAlgorithm] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_MLAlgorithm_Status] CHECK ([Status] IN ('Active', 'Deprecated'))
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Curated, fixed catalog of machine-learning algorithms a Training Pipeline can use. Opinionated by design (a small set of well-understood algorithms); the differentiation is in the data/features, not algorithm innovation. Each row declares the algorithm''s supported problem types, its hyperparameter schema, and the Python-sidecar driver key that executes it. EXAMPLE: "Gradient Boosting (XGBoost)" with DriverClass "xgboost".', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithm';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the algorithm (e.g., "Gradient Boosting (XGBoost)", "Logistic Regression")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithm', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional description of the algorithm and when to use it', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithm', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Comma-delimited list of supported problem types (e.g., "classification", "regression", or "classification,regression")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithm', @level2type=N'COLUMN', @level2name=N'ProblemTypes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Algorithm key passed to the Python training/inference sidecar (e.g., "xgboost", "lightgbm", "logistic_regression", "random_forest", "ridge", "mlp")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithm', @level2type=N'COLUMN', @level2name=N'DriverClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON Schema describing the algorithm''s tunable hyperparameters (drives the UI form and validation)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithm', @level2type=N'COLUMN', @level2name=N'HyperparameterSchema';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object of default hyperparameter values applied when a pipeline does not override them', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithm', @level2type=N'COLUMN', @level2name=N'DefaultHyperparameters';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, the algorithm produces per-feature importance scores used for explainability and the leakage guard', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithm', @level2type=N'COLUMN', @level2name=N'SupportsFeatureImportance';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle status: Active (selectable) or Deprecated', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithm', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- ============================================================================
-- 2. MLAlgorithmUseCase (MJ: ML Algorithm Use Cases) — decision-relevant scenarios
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLAlgorithmUseCase] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [ProblemTypeScope] NVARCHAR(20) NOT NULL DEFAULT 'any',
    [Guidance] NVARCHAR(MAX) NULL,
    [DisplayOrder] INT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_MLAlgorithmUseCase] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_MLAlgorithmUseCase_ProblemTypeScope] CHECK ([ProblemTypeScope] IN ('classification', 'regression', 'any'))
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A curated, decision-relevant scenario used to guide algorithm choice — NOT a business label (churn/renewal/attendee-return are all the same "binary classification" shape, so they do not differentiate algorithms). Joined to MLAlgorithm via MLAlgorithmUseCaseRanking. EXAMPLES: "Binary classification (yes/no)", "Regression (predict a number)", "Interpretability required", "Minimal tuning (business-user)", "Large/wide dataset (speed)", "Embedding/LLM-feature-heavy", "Small dataset".', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCase';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the scenario (e.g., "Interpretability required")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCase', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional description of the scenario', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCase', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which problem type this scenario applies to: classification, regression, or any', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCase', @level2type=N'COLUMN', @level2name=N'ProblemTypeScope';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Longer agent-readable guidance on when this scenario applies and what it implies for algorithm choice', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCase', @level2type=N'COLUMN', @level2name=N'Guidance';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Ordering hint for displaying scenarios in the UI', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCase', @level2type=N'COLUMN', @level2name=N'DisplayOrder';
GO

-- ============================================================================
-- 3. MLAlgorithmUseCaseRanking (MJ: ML Algorithm Use Case Rankings) — algorithm x use-case fit
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLAlgorithmUseCaseRanking] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [MLAlgorithmID] UNIQUEIDENTIFIER NOT NULL,
    [MLAlgorithmUseCaseID] UNIQUEIDENTIFIER NOT NULL,
    [SuitabilityScore] INT NOT NULL,
    [RecommendationLevel] NVARCHAR(20) NOT NULL,
    [Rationale] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_MLAlgorithmUseCaseRanking] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_MLAlgorithmUseCaseRanking_SuitabilityScore] CHECK ([SuitabilityScore] >= 1 AND [SuitabilityScore] <= 5),
    CONSTRAINT [CK_MLAlgorithmUseCaseRanking_RecommendationLevel] CHECK ([RecommendationLevel] IN ('Primary', 'Strong', 'Viable', 'Weak', 'NotRecommended')),
    CONSTRAINT [UQ_MLAlgorithmUseCaseRanking_Algo_UseCase] UNIQUE ([MLAlgorithmID], [MLAlgorithmUseCaseID]),
    CONSTRAINT [FK_MLAlgorithmUseCaseRanking_Algorithm] FOREIGN KEY ([MLAlgorithmID])
        REFERENCES ${flyway:defaultSchema}.[MLAlgorithm]([ID]),
    CONSTRAINT [FK_MLAlgorithmUseCaseRanking_UseCase] FOREIGN KEY ([MLAlgorithmUseCaseID])
        REFERENCES ${flyway:defaultSchema}.[MLAlgorithmUseCase]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Codifies how well each algorithm fits each use-case scenario, so both the model-development agent and a non-expert human get guided, rationale-bearing defaults instead of guessing. One row per (algorithm, use case) pair.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCaseRanking';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the algorithm being ranked', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCaseRanking', @level2type=N'COLUMN', @level2name=N'MLAlgorithmID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the use-case scenario the algorithm is ranked for', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCaseRanking', @level2type=N'COLUMN', @level2name=N'MLAlgorithmUseCaseID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Numeric suitability for sorting/ranking, 1 (worst) to 5 (best)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCaseRanking', @level2type=N'COLUMN', @level2name=N'SuitabilityScore';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Categorical recommendation: Primary, Strong, Viable, Weak, or NotRecommended', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCaseRanking', @level2type=N'COLUMN', @level2name=N'RecommendationLevel';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Plain-language explanation of the ranking, readable by both agents and humans (e.g., "Gives feature importances but not simple coefficients — if a stakeholder needs to see exactly why each prediction was made, prefer Logistic/Ridge.")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithmUseCaseRanking', @level2type=N'COLUMN', @level2name=N'Rationale';
GO

-- ============================================================================
-- 4. MLTrainingPipeline (MJ: ML Training Pipelines) — declarative model definition
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLTrainingPipeline] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [Version] INT NOT NULL DEFAULT 1,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    [TargetEntityID] UNIQUEIDENTIFIER NOT NULL,
    [TargetVariable] NVARCHAR(500) NOT NULL,
    [ProblemType] NVARCHAR(20) NOT NULL,
    [AlgorithmID] UNIQUEIDENTIFIER NOT NULL,
    [Hyperparameters] NVARCHAR(MAX) NULL,
    [SourceBindings] NVARCHAR(MAX) NULL,
    [FeatureSteps] NVARCHAR(MAX) NULL,
    [AsOfStrategy] NVARCHAR(MAX) NULL,
    [LeakageGuard] NVARCHAR(MAX) NULL,
    [ValidationStrategy] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_MLTrainingPipeline] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_MLTrainingPipeline_Status] CHECK ([Status] IN ('Draft', 'Published', 'Archived')),
    CONSTRAINT [CK_MLTrainingPipeline_ProblemType] CHECK ([ProblemType] IN ('classification', 'regression')),
    CONSTRAINT [FK_MLTrainingPipeline_TargetEntity] FOREIGN KEY ([TargetEntityID])
        REFERENCES ${flyway:defaultSchema}.[Entity]([ID]),
    CONSTRAINT [FK_MLTrainingPipeline_Algorithm] FOREIGN KEY ([AlgorithmID])
        REFERENCES ${flyway:defaultSchema}.[MLAlgorithm]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A declarative definition of how to build a predictive model: what to predict (target), over which entity''s records, using which algorithm, assembled from which sources via which feature steps, validated how. Saving a pipeline saves intent, not results — each successful training run of it produces an immutable MLModel. EXAMPLE: "Member Renewal Predictor" predicts Member.Renewed using XGBoost from tenure/engagement features plus a member-summary embedding, with a point-in-time as-of strategy and a locked holdout.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable name of the pipeline', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional description of what this pipeline predicts and how', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Monotonic version number of the pipeline definition', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'Version';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle status: Draft, Published, or Archived', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the entity whose records are the training units (e.g., Members)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'TargetEntityID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The label being predicted — a column or expression on the target entity (e.g., "Renewed")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'TargetVariable';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Problem type: classification or regression', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'ProblemType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the chosen algorithm in the catalog', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'AlgorithmID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON hyperparameter overrides for the chosen algorithm', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'Hyperparameters';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON ordered references to source entities / queries / external entities / vector sets the features are drawn from', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'SourceBindings';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON ordered DAG of FeatureAssembly steps (selection, null-handling, encoding, scaling, embedding/LLM featurization) executed by the single FeatureAssembly executor', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'FeatureSteps';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON point-in-time configuration: { Mode: none|column|offset, Column?, OffsetDays? } — assembles features as of the decision point to prevent future leakage', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'AsOfStrategy';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON leakage guard: deny-list of fields/sources that must not enter features, plus the single-feature-dominance threshold that flags suspicious runs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'LeakageGuard';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON validation strategy: { Strategy: train_test_split|kfold|holdout, TestSize?, K?, LockedHoldoutFraction }', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'ValidationStrategy';
GO

-- ============================================================================
-- 5. MLModel (MJ: ML Models) — immutable, versioned trained model
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLModel] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PipelineID] UNIQUEIDENTIFIER NOT NULL,
    [Version] INT NOT NULL DEFAULT 1,
    [AlgorithmID] UNIQUEIDENTIFIER NOT NULL,
    [ArtifactFileID] UNIQUEIDENTIFIER NULL,
    [FittedPreprocessing] NVARCHAR(MAX) NULL,
    [FeatureSchema] NVARCHAR(MAX) NOT NULL,
    [TargetVariable] NVARCHAR(500) NOT NULL,
    [ProblemType] NVARCHAR(20) NOT NULL,
    [Metrics] NVARCHAR(MAX) NULL,
    [HoldoutMetrics] NVARCHAR(MAX) NULL,
    [FeatureImportance] NVARCHAR(MAX) NULL,
    [Lineage] NVARCHAR(MAX) NULL,
    [TrainedAt] DATETIMEOFFSET NULL,
    [TrainingDurationSec] INT NULL,
    [TrainingRowCount] INT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    CONSTRAINT [PK_MLModel] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_MLModel_ProblemType] CHECK ([ProblemType] IN ('classification', 'regression')),
    CONSTRAINT [CK_MLModel_Status] CHECK ([Status] IN ('Draft', 'Validated', 'Published', 'Archived')),
    CONSTRAINT [FK_MLModel_Pipeline] FOREIGN KEY ([PipelineID])
        REFERENCES ${flyway:defaultSchema}.[MLTrainingPipeline]([ID]),
    CONSTRAINT [FK_MLModel_Algorithm] FOREIGN KEY ([AlgorithmID])
        REFERENCES ${flyway:defaultSchema}.[MLAlgorithm]([ID]),
    CONSTRAINT [FK_MLModel_ArtifactFile] FOREIGN KEY ([ArtifactFileID])
        REFERENCES ${flyway:defaultSchema}.[File]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'An immutable, versioned trained predictive model produced by a training run — distinct from MJ: AI Models (the catalog of off-the-shelf foundation models we CALL). A model is never mutated in place; retraining produces a new MLModel. The serialized artifact lives in MJStorage (MJ: Files) and the FITTED preprocessing parameters travel WITH the model so inference applies the exact transforms learned at training time (prevents train/serve skew). Inference runs via the Python sidecar.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the ML Training Pipeline that produced this model (lineage)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'PipelineID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Monotonic version number of this model under its pipeline', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'Version';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the algorithm used to train this model', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'AlgorithmID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the MJ: Files record holding the serialized model artifact in MJStorage', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'ArtifactFileID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON of the fitted preprocessing parameters (means/std, one-hot vocabularies, bin edges, imputation fills) learned at training time and re-applied verbatim at inference — the anti train/serve skew payload', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'FittedPreprocessing';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON ordered list of feature names + kinds the model expects as input (the inference input contract)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'FeatureSchema';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The label this model predicts', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'TargetVariable';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Problem type: classification or regression', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'ProblemType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON of training + validation metrics (AUC, F1, accuracy, RMSE, etc.)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'Metrics';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON metrics on the locked holdout set the search never saw — scored exactly once for an honest performance number', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'HoldoutMetrics';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON per-feature importance/contribution for explainability and the leakage guard', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'FeatureImportance';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON lineage: data version(s), pipeline version, source bindings, as-of date, sidecar version, and any embedding/LLM model versions used to build features', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'Lineage';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp when training completed', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'TrainedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Wall-clock training duration in seconds', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'TrainingDurationSec';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of rows used to train the model', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'TrainingRowCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle status: Draft, Validated, Published, or Archived', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- ============================================================================
-- 6. Experiment (MJ: Experiments) — GENERIC reusable experiment definition
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[Experiment] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [ExperimentType] NVARCHAR(50) NOT NULL,
    [Goal] NVARCHAR(MAX) NULL,
    [TargetMetric] NVARCHAR(100) NULL,
    [PlanSpecTemplate] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT [PK_Experiment] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_Experiment_Status] CHECK ([Status] IN ('Active', 'Archived'))
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A GENERIC, reusable definition of an experiment — the durable "what we are trying to optimize," independent of any single execution. Each kick-off of the experiment creates an ExperimentSession under it (so retraining/re-optimizing monthly = new sessions under the same Experiment, enabling comparison over time). Deliberately NOT ML-specific: ExperimentType discriminates the consumer (MLModelSearch, PromptOptimization, AgentConfigSearch, ...) so prompt-optimization, agent-config search, and eval sweeps reuse the same Experiment/Session/Iteration substrate. Predictive Studio is the first consumer.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Experiment';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable name of the experiment', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Experiment', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional description of the experiment', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Experiment', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Discriminator naming the kind of experiment / consuming subsystem (e.g., "MLModelSearch", "PromptOptimization", "AgentConfigSearch"). Intentionally an open NVARCHAR (no CHECK constraint) so new consumers can introduce types without a schema migration.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Experiment', @level2type=N'COLUMN', @level2name=N'ExperimentType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Natural-language objective of the experiment (e.g., "maximize holdout AUC for renewal prediction")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Experiment', @level2type=N'COLUMN', @level2name=N'Goal';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The metric the experiment optimizes (e.g., "AUC", "F1", "RMSE") — the normalized number iterations are scored and ranked by', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Experiment', @level2type=N'COLUMN', @level2name=N'TargetMetric';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional JSON reusable plan template that seeds new sessions'' PlanSpec (consumer-specific shape; opaque to the generic substrate)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Experiment', @level2type=N'COLUMN', @level2name=N'PlanSpecTemplate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle status: Active or Archived', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Experiment', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- ============================================================================
-- 7. ExperimentSession (MJ: Experiment Sessions) — GENERIC one execution of an Experiment
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[ExperimentSession] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ExperimentID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [Goal] NVARCHAR(MAX) NULL,
    [Budget] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Planning',
    [PlanSpec] NVARCHAR(MAX) NULL,
    [Leaderboard] NVARCHAR(MAX) NULL,
    [AgentRunID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_ExperimentSession] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_ExperimentSession_Status] CHECK ([Status] IN ('Planning', 'AwaitingApproval', 'Running', 'Paused', 'Completed', 'Cancelled')),
    CONSTRAINT [FK_ExperimentSession_Experiment] FOREIGN KEY ([ExperimentID])
        REFERENCES ${flyway:defaultSchema}.[Experiment]([ID]),
    CONSTRAINT [FK_ExperimentSession_AgentRun] FOREIGN KEY ([AgentRunID])
        REFERENCES ${flyway:defaultSchema}.[AIAgentRun]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A GENERIC single execution of an Experiment: a budgeted, plan-then-execute-then-refine search that groups N iterations, maintains a leaderboard, and is driven by an owning agent run with a human approval gate. ML-agnostic — the ML-specific work hangs off ExperimentSessionIteration via MLTrainingRun. The execution phase runs iterations in WAVES through Record Set Processing (bounded concurrency, budget, pause/resume, audit), with the adaptive prune/what-next logic above it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSession';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Experiment definition this session executes', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSession', @level2type=N'COLUMN', @level2name=N'ExperimentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable name of this session/execution', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSession', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional per-session objective override (defaults to the parent Experiment''s Goal)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSession', @level2type=N'COLUMN', @level2name=N'Goal';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON budget bounding autonomy for this session: max compute-cost / max iterations / max wallclock', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSession', @level2type=N'COLUMN', @level2name=N'Budget';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle status: Planning, AwaitingApproval, Running, Paused, Completed, or Cancelled', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSession', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON of the approved plan the deterministic orchestrator executes for this session (consumer-specific shape; for Predictive Studio this is the ModelingPlanSpec). Opaque to the generic substrate.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSession', @level2type=N'COLUMN', @level2name=N'PlanSpec';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON snapshot of the best iterations so far (also derivable from ExperimentSessionIteration scores)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSession', @level2type=N'COLUMN', @level2name=N'Leaderboard';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the MJ: AI Agent Run that owns/drives this session', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSession', @level2type=N'COLUMN', @level2name=N'AgentRunID';
GO

-- ============================================================================
-- 8. ExperimentSessionIteration (MJ: Experiment Session Iterations) — GENERIC one attempt within a session
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[ExperimentSessionIteration] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ExperimentSessionID] UNIQUEIDENTIFIER NOT NULL,
    [Sequence] INT NOT NULL DEFAULT 0,
    [Label] NVARCHAR(255) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [Score] DECIMAL(18,6) NULL,
    [ComputeCost] DECIMAL(18,6) NULL,
    [TokensUsed] INT NULL,
    [Rationale] NVARCHAR(MAX) NULL,
    [AIAgentRunID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_ExperimentSessionIteration] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_ExperimentSessionIteration_Status] CHECK ([Status] IN ('Pending', 'Running', 'Completed', 'Failed', 'Pruned')),
    CONSTRAINT [FK_ExperimentSessionIteration_Session] FOREIGN KEY ([ExperimentSessionID])
        REFERENCES ${flyway:defaultSchema}.[ExperimentSession]([ID]),
    CONSTRAINT [FK_ExperimentSessionIteration_AIAgentRun] FOREIGN KEY ([AIAgentRunID])
        REFERENCES ${flyway:defaultSchema}.[AIAgentRun]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A GENERIC single attempt within an ExperimentSession — the polymorphic anchor and the leaderboard unit. Owns the cross-cutting "attempt" accounting every experiment type shares: sequence, status, the normalized Score, compute/token cost, the agent reasoning for trying it, and (optionally) the AI Agent Run that executed it. Consumer-specific detail hangs off this row: Predictive Studio attaches an MLTrainingRun; a future prompt-optimization consumer would attach its own leaf run table the same way.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSessionIteration';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the ExperimentSession this iteration belongs to', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSessionIteration', @level2type=N'COLUMN', @level2name=N'ExperimentSessionID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Order of this iteration within its session', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSessionIteration', @level2type=N'COLUMN', @level2name=N'Sequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional human-readable label for the attempt (e.g., "XGBoost + engagement features")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSessionIteration', @level2type=N'COLUMN', @level2name=N'Label';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Iteration status: Pending, Running, Completed, Failed, or Pruned', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSessionIteration', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The normalized metric value this iteration achieved (the parent Experiment''s TargetMetric) — used to rank the leaderboard', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSessionIteration', @level2type=N'COLUMN', @level2name=N'Score';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Compute cost attributed to this iteration, for budget enforcement', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSessionIteration', @level2type=N'COLUMN', @level2name=N'ComputeCost';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'LLM tokens used by this iteration (e.g., agent internal choice prompts), for budget enforcement', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSessionIteration', @level2type=N'COLUMN', @level2name=N'TokensUsed';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Why this iteration was tried (agent rationale) and any observations', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSessionIteration', @level2type=N'COLUMN', @level2name=N'Rationale';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional foreign key to the MJ: AI Agent Run that executed this iteration (NULL when executed by deterministic code with no dedicated agent run)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ExperimentSessionIteration', @level2type=N'COLUMN', @level2name=N'AIAgentRunID';
GO

-- ============================================================================
-- 9. MLTrainingRun (MJ: ML Training Runs) — ML-specific detail of an iteration / standalone train
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLTrainingRun] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PipelineID] UNIQUEIDENTIFIER NOT NULL,
    [ResultingModelID] UNIQUEIDENTIFIER NULL,
    [ExperimentSessionIterationID] UNIQUEIDENTIFIER NULL,
    [FeaturesUsed] NVARCHAR(MAX) NULL,
    [AlgorithmID] UNIQUEIDENTIFIER NOT NULL,
    [Hyperparameters] NVARCHAR(MAX) NULL,
    [ValidationResults] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [StartedAt] DATETIMEOFFSET NULL,
    [CompletedAt] DATETIMEOFFSET NULL,
    [ComputeCost] DECIMAL(18,6) NULL,
    [TokensUsed] INT NULL,
    [Notes] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_MLTrainingRun] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_MLTrainingRun_Status] CHECK ([Status] IN ('Pending', 'Running', 'Completed', 'Failed', 'Pruned')),
    CONSTRAINT [FK_MLTrainingRun_Pipeline] FOREIGN KEY ([PipelineID])
        REFERENCES ${flyway:defaultSchema}.[MLTrainingPipeline]([ID]),
    CONSTRAINT [FK_MLTrainingRun_ResultingModel] FOREIGN KEY ([ResultingModelID])
        REFERENCES ${flyway:defaultSchema}.[MLModel]([ID]),
    CONSTRAINT [FK_MLTrainingRun_Iteration] FOREIGN KEY ([ExperimentSessionIterationID])
        REFERENCES ${flyway:defaultSchema}.[ExperimentSessionIteration]([ID]),
    CONSTRAINT [FK_MLTrainingRun_Algorithm] FOREIGN KEY ([AlgorithmID])
        REFERENCES ${flyway:defaultSchema}.[MLAlgorithm]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The ML-specific detail of a training attempt — the leaf that hangs off a generic ExperimentSessionIteration when part of an agent-driven search, OR stands alone (ExperimentSessionIterationID NULL) for a one-off manual train. Captures the exact feature set, algorithm, hyperparameters, validation results, and the model produced (ResultingModelID is nullable: a run may be pruned/failed and produce no model). The generic search-level accounting (leaderboard Score, rationale, the driving agent run) lives on the parent iteration; this row keeps the ML execution detail.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the ML Training Pipeline this run executed', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'PipelineID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the MLModel this run produced, when it produced one (NULL for pruned/failed runs)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'ResultingModelID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional foreign key to the generic ExperimentSessionIteration that owns this run (NULL for standalone/manual training outside a session)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'ExperimentSessionIterationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON of the exact feature set used for this run', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'FeaturesUsed';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the algorithm used for this run', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'AlgorithmID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON hyperparameters used for this run', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'Hyperparameters';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON of all validation metrics, per-fold where applicable (the full metric blob; the parent iteration''s Score is the single normalized leaderboard number)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'ValidationResults';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Run status: Pending, Running, Completed, Failed, or Pruned', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp the run started', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'StartedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp the run completed', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'CompletedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Compute cost attributed to this run, for budget enforcement', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'ComputeCost';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'LLM tokens used by this run, for budget enforcement', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'TokensUsed';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Notes / observations about this run', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingRun', @level2type=N'COLUMN', @level2name=N'Notes';
GO

-- ============================================================================
-- 10. MLModelScoringBinding (MJ: ML Model Scoring Bindings) — where a model scores (lineage)
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLModelScoringBinding] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [MLModelID] UNIQUEIDENTIFIER NOT NULL,
    [RecordProcessID] UNIQUEIDENTIFIER NULL,
    [TargetEntityID] UNIQUEIDENTIFIER NULL,
    [TargetColumn] NVARCHAR(255) NULL,
    [Mode] NVARCHAR(20) NOT NULL DEFAULT 'OnDemand',
    [MaterializedResultID] UNIQUEIDENTIFIER NULL,
    [LastScoredAt] DATETIMEOFFSET NULL,
    [LastRowCount] INT NULL,
    CONSTRAINT [PK_MLModelScoringBinding] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_MLModelScoringBinding_Mode] CHECK ([Mode] IN ('OnDemand', 'Scheduled', 'Materialized')),
    CONSTRAINT [FK_MLModelScoringBinding_MLModel] FOREIGN KEY ([MLModelID])
        REFERENCES ${flyway:defaultSchema}.[MLModel]([ID]),
    CONSTRAINT [FK_MLModelScoringBinding_RecordProcess] FOREIGN KEY ([RecordProcessID])
        REFERENCES ${flyway:defaultSchema}.[RecordProcess]([ID]),
    CONSTRAINT [FK_MLModelScoringBinding_TargetEntity] FOREIGN KEY ([TargetEntityID])
        REFERENCES ${flyway:defaultSchema}.[Entity]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Binds an MLModel to where it scores, so staleness can be detected and retraining driven (maintenance). The scoring itself runs as a Record Process (the new ML inference work type); the binding records the target entity/column written and the scoring mode. MaterializedResultID is a forward-compatible SOFT reference to MJ: Materialized Results (PR #2770), not yet a FK because that table is not merged.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModelScoringBinding';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the MLModel that does the scoring', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModelScoringBinding', @level2type=N'COLUMN', @level2name=N'MLModelID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Record Process that runs the ML inference work for this binding', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModelScoringBinding', @level2type=N'COLUMN', @level2name=N'RecordProcessID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the entity that receives the prediction (when scores are written back)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModelScoringBinding', @level2type=N'COLUMN', @level2name=N'TargetEntityID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Name of the column that receives the prediction (when scores are written back / materialized)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModelScoringBinding', @level2type=N'COLUMN', @level2name=N'TargetColumn';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Scoring mode: OnDemand, Scheduled, or Materialized', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModelScoringBinding', @level2type=N'COLUMN', @level2name=N'Mode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference to a MJ: Materialized Results row (PR #2770) when Mode=Materialized; not a FK until that table exists', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModelScoringBinding', @level2type=N'COLUMN', @level2name=N'MaterializedResultID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp of the most recent scoring run for this binding', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModelScoringBinding', @level2type=N'COLUMN', @level2name=N'LastScoredAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of records scored in the most recent scoring run', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModelScoringBinding', @level2type=N'COLUMN', @level2name=N'LastRowCount';
GO

















































/**************************************************************************************************
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
 **************************************************************************************************/



/* SQL generated to create new entity MJ: ML Algorithms */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '563629f3-3718-4a8d-a853-0337478a34ff',
         'MJ: ML Algorithms',
         'ML Algorithms',
         'Curated, fixed catalog of machine-learning algorithms a Training Pipeline can use. Opinionated by design (a small set of well-understood algorithms); the differentiation is in the data/features, not algorithm innovation. Each row declares the algorithm''s supported problem types, its hyperparameter schema, and the Python-sidecar driver key that executes it. EXAMPLE: "Gradient Boosting (XGBoost)" with DriverClass "xgboost".',
         NULL,
         'MLAlgorithm',
         'vwMLAlgorithms',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: ML Algorithms to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '563629f3-3718-4a8d-a853-0337478a34ff', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithms for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('563629f3-3718-4a8d-a853-0337478a34ff', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithms for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('563629f3-3718-4a8d-a853-0337478a34ff', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithms for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('563629f3-3718-4a8d-a853-0337478a34ff', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: ML Algorithm Use Cases */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'ac6cbf38-ad96-4e3c-b13b-1f4a9601110c',
         'MJ: ML Algorithm Use Cases',
         'ML Algorithm Use Cases',
         'A curated, decision-relevant scenario used to guide algorithm choice — NOT a business label (churn/renewal/attendee-return are all the same "binary classification" shape, so they do not differentiate algorithms). Joined to MLAlgorithm via MLAlgorithmUseCaseRanking. EXAMPLES: "Binary classification (yes/no)", "Regression (predict a number)", "Interpretability required", "Minimal tuning (business-user)", "Large/wide dataset (speed)", "Embedding/LLM-feature-heavy", "Small dataset".',
         NULL,
         'MLAlgorithmUseCase',
         'vwMLAlgorithmUseCases',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: ML Algorithm Use Cases to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ac6cbf38-ad96-4e3c-b13b-1f4a9601110c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Cases for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ac6cbf38-ad96-4e3c-b13b-1f4a9601110c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Cases for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ac6cbf38-ad96-4e3c-b13b-1f4a9601110c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Cases for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ac6cbf38-ad96-4e3c-b13b-1f4a9601110c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: ML Algorithm Use Case Rankings */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'a3d384c6-af3e-499a-9522-86fc1e58f15c',
         'MJ: ML Algorithm Use Case Rankings',
         'ML Algorithm Use Case Rankings',
         'Codifies how well each algorithm fits each use-case scenario, so both the model-development agent and a non-expert human get guided, rationale-bearing defaults instead of guessing. One row per (algorithm, use case) pair.',
         NULL,
         'MLAlgorithmUseCaseRanking',
         'vwMLAlgorithmUseCaseRankings',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: ML Algorithm Use Case Rankings to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a3d384c6-af3e-499a-9522-86fc1e58f15c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Case Rankings for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3d384c6-af3e-499a-9522-86fc1e58f15c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Case Rankings for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3d384c6-af3e-499a-9522-86fc1e58f15c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Case Rankings for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3d384c6-af3e-499a-9522-86fc1e58f15c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: ML Training Pipelines */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '4ecbc565-5795-460a-ae61-083bd7799765',
         'MJ: ML Training Pipelines',
         'ML Training Pipelines',
         'A declarative definition of how to build a predictive model: what to predict (target), over which entity''s records, using which algorithm, assembled from which sources via which feature steps, validated how. Saving a pipeline saves intent, not results — each successful training run of it produces an immutable MLModel. EXAMPLE: "Member Renewal Predictor" predicts Member.Renewed using XGBoost from tenure/engagement features plus a member-summary embedding, with a point-in-time as-of strategy and a locked holdout.',
         NULL,
         'MLTrainingPipeline',
         'vwMLTrainingPipelines',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: ML Training Pipelines to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4ecbc565-5795-460a-ae61-083bd7799765', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Pipelines for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4ecbc565-5795-460a-ae61-083bd7799765', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Pipelines for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4ecbc565-5795-460a-ae61-083bd7799765', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Pipelines for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4ecbc565-5795-460a-ae61-083bd7799765', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: ML Models */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '109edf71-1995-4a46-8ec8-09c2c2ff5310',
         'MJ: ML Models',
         'ML Models',
         'An immutable, versioned trained predictive model produced by a training run — distinct from MJ: AI Models (the catalog of off-the-shelf foundation models we CALL). A model is never mutated in place; retraining produces a new MLModel. The serialized artifact lives in MJStorage (MJ: Files) and the FITTED preprocessing parameters travel WITH the model so inference applies the exact transforms learned at training time (prevents train/serve skew). Inference runs via the Python sidecar.',
         NULL,
         'MLModel',
         'vwMLModels',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: ML Models to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '109edf71-1995-4a46-8ec8-09c2c2ff5310', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Models for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('109edf71-1995-4a46-8ec8-09c2c2ff5310', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Models for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('109edf71-1995-4a46-8ec8-09c2c2ff5310', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Models for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('109edf71-1995-4a46-8ec8-09c2c2ff5310', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Experiments */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'b134a583-9297-4399-9234-7b1b223db2c7',
         'MJ: Experiments',
         'Experiments',
         'A GENERIC, reusable definition of an experiment — the durable "what we are trying to optimize," independent of any single execution. Each kick-off of the experiment creates an ExperimentSession under it (so retraining/re-optimizing monthly = new sessions under the same Experiment, enabling comparison over time). Deliberately NOT ML-specific: ExperimentType discriminates the consumer (MLModelSearch, PromptOptimization, AgentConfigSearch, ...) so prompt-optimization, agent-config search, and eval sweeps reuse the same Experiment/Session/Iteration substrate. Predictive Studio is the first consumer.',
         NULL,
         'Experiment',
         'vwExperiments',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Experiments to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b134a583-9297-4399-9234-7b1b223db2c7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiments for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b134a583-9297-4399-9234-7b1b223db2c7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiments for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b134a583-9297-4399-9234-7b1b223db2c7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiments for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b134a583-9297-4399-9234-7b1b223db2c7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Experiment Sessions */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '7fd949b2-b950-464e-b702-b93d48709c0d',
         'MJ: Experiment Sessions',
         'Experiment Sessions',
         'A GENERIC single execution of an Experiment: a budgeted, plan-then-execute-then-refine search that groups N iterations, maintains a leaderboard, and is driven by an owning agent run with a human approval gate. ML-agnostic — the ML-specific work hangs off ExperimentSessionIteration via MLTrainingRun. The execution phase runs iterations in WAVES through Record Set Processing (bounded concurrency, budget, pause/resume, audit), with the adaptive prune/what-next logic above it.',
         NULL,
         'ExperimentSession',
         'vwExperimentSessions',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Experiment Sessions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7fd949b2-b950-464e-b702-b93d48709c0d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Sessions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7fd949b2-b950-464e-b702-b93d48709c0d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Sessions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7fd949b2-b950-464e-b702-b93d48709c0d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Sessions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7fd949b2-b950-464e-b702-b93d48709c0d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Experiment Session Iterations */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'ffb4bae5-4fc3-4973-b38a-5e661203d54e',
         'MJ: Experiment Session Iterations',
         'Experiment Session Iterations',
         'A GENERIC single attempt within an ExperimentSession — the polymorphic anchor and the leaderboard unit. Owns the cross-cutting "attempt" accounting every experiment type shares: sequence, status, the normalized Score, compute/token cost, the agent reasoning for trying it, and (optionally) the AI Agent Run that executed it. Consumer-specific detail hangs off this row: Predictive Studio attaches an MLTrainingRun; a future prompt-optimization consumer would attach its own leaf run table the same way.',
         NULL,
         'ExperimentSessionIteration',
         'vwExperimentSessionIterations',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Experiment Session Iterations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ffb4bae5-4fc3-4973-b38a-5e661203d54e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Session Iterations for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ffb4bae5-4fc3-4973-b38a-5e661203d54e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Session Iterations for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ffb4bae5-4fc3-4973-b38a-5e661203d54e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Session Iterations for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ffb4bae5-4fc3-4973-b38a-5e661203d54e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: ML Training Runs */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'cbb07cbe-8c31-4f66-bf6d-e4b96c956d00',
         'MJ: ML Training Runs',
         'ML Training Runs',
         'The ML-specific detail of a training attempt — the leaf that hangs off a generic ExperimentSessionIteration when part of an agent-driven search, OR stands alone (ExperimentSessionIterationID NULL) for a one-off manual train. Captures the exact feature set, algorithm, hyperparameters, validation results, and the model produced (ResultingModelID is nullable: a run may be pruned/failed and produce no model). The generic search-level accounting (leaderboard Score, rationale, the driving agent run) lives on the parent iteration; this row keeps the ML execution detail.',
         NULL,
         'MLTrainingRun',
         'vwMLTrainingRuns',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: ML Training Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'cbb07cbe-8c31-4f66-bf6d-e4b96c956d00', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cbb07cbe-8c31-4f66-bf6d-e4b96c956d00', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cbb07cbe-8c31-4f66-bf6d-e4b96c956d00', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cbb07cbe-8c31-4f66-bf6d-e4b96c956d00', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: ML Model Scoring Bindings */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'ca2c3f5c-bf62-4c96-95bf-ec6ac21d360d',
         'MJ: ML Model Scoring Bindings',
         'ML Model Scoring Bindings',
         'Binds an MLModel to where it scores, so staleness can be detected and retraining driven (maintenance). The scoring itself runs as a Record Process (the new ML inference work type); the binding records the target entity/column written and the scoring mode. MaterializedResultID is a forward-compatible SOFT reference to MJ: Materialized Results (PR #2770), not yet a FK because that table is not merged.',
         NULL,
         'MLModelScoringBinding',
         'vwMLModelScoringBindings',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: ML Model Scoring Bindings to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ca2c3f5c-bf62-4c96-95bf-ec6ac21d360d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Model Scoring Bindings for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ca2c3f5c-bf62-4c96-95bf-ec6ac21d360d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Model Scoring Bindings for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ca2c3f5c-bf62-4c96-95bf-ec6ac21d360d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Model Scoring Bindings for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ca2c3f5c-bf62-4c96-95bf-ec6ac21d360d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithm */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithm] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithm */
UPDATE [${flyway:defaultSchema}].[MLAlgorithm] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithm */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithm] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithm */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithm] ADD CONSTRAINT [DF___mj_MLAlgorithm___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithm */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithm] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithm */
UPDATE [${flyway:defaultSchema}].[MLAlgorithm] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithm */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithm] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithm */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithm] ADD CONSTRAINT [DF___mj_MLAlgorithm___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingPipeline */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingPipeline] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingPipeline */
UPDATE [${flyway:defaultSchema}].[MLTrainingPipeline] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingPipeline */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingPipeline] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingPipeline */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingPipeline] ADD CONSTRAINT [DF___mj_MLTrainingPipeline___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingPipeline */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingPipeline] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingPipeline */
UPDATE [${flyway:defaultSchema}].[MLTrainingPipeline] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingPipeline */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingPipeline] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingPipeline */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingPipeline] ADD CONSTRAINT [DF___mj_MLTrainingPipeline___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModel */
ALTER TABLE [${flyway:defaultSchema}].[MLModel] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModel */
UPDATE [${flyway:defaultSchema}].[MLModel] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModel */
ALTER TABLE [${flyway:defaultSchema}].[MLModel] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModel */
ALTER TABLE [${flyway:defaultSchema}].[MLModel] ADD CONSTRAINT [DF___mj_MLModel___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModel */
ALTER TABLE [${flyway:defaultSchema}].[MLModel] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModel */
UPDATE [${flyway:defaultSchema}].[MLModel] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModel */
ALTER TABLE [${flyway:defaultSchema}].[MLModel] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModel */
ALTER TABLE [${flyway:defaultSchema}].[MLModel] ADD CONSTRAINT [DF___mj_MLModel___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCase] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
UPDATE [${flyway:defaultSchema}].[MLAlgorithmUseCase] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCase] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCase] ADD CONSTRAINT [DF___mj_MLAlgorithmUseCase___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCase] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
UPDATE [${flyway:defaultSchema}].[MLAlgorithmUseCase] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCase] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCase] ADD CONSTRAINT [DF___mj_MLAlgorithmUseCase___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExperimentSessionIteration */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSessionIteration] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExperimentSessionIteration */
UPDATE [${flyway:defaultSchema}].[ExperimentSessionIteration] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExperimentSessionIteration */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSessionIteration] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExperimentSessionIteration */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSessionIteration] ADD CONSTRAINT [DF___mj_ExperimentSessionIteration___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExperimentSessionIteration */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSessionIteration] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExperimentSessionIteration */
UPDATE [${flyway:defaultSchema}].[ExperimentSessionIteration] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExperimentSessionIteration */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSessionIteration] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExperimentSessionIteration */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSessionIteration] ADD CONSTRAINT [DF___mj_ExperimentSessionIteration___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Experiment */
ALTER TABLE [${flyway:defaultSchema}].[Experiment] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Experiment */
UPDATE [${flyway:defaultSchema}].[Experiment] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Experiment */
ALTER TABLE [${flyway:defaultSchema}].[Experiment] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Experiment */
ALTER TABLE [${flyway:defaultSchema}].[Experiment] ADD CONSTRAINT [DF___mj_Experiment___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Experiment */
ALTER TABLE [${flyway:defaultSchema}].[Experiment] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Experiment */
UPDATE [${flyway:defaultSchema}].[Experiment] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Experiment */
ALTER TABLE [${flyway:defaultSchema}].[Experiment] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Experiment */
ALTER TABLE [${flyway:defaultSchema}].[Experiment] ADD CONSTRAINT [DF___mj_Experiment___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
UPDATE [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] ADD CONSTRAINT [DF___mj_MLAlgorithmUseCaseRanking___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
UPDATE [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
ALTER TABLE [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] ADD CONSTRAINT [DF___mj_MLAlgorithmUseCaseRanking___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExperimentSession */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSession] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExperimentSession */
UPDATE [${flyway:defaultSchema}].[ExperimentSession] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExperimentSession */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSession] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExperimentSession */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSession] ADD CONSTRAINT [DF___mj_ExperimentSession___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExperimentSession */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSession] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExperimentSession */
UPDATE [${flyway:defaultSchema}].[ExperimentSession] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExperimentSession */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSession] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExperimentSession */
ALTER TABLE [${flyway:defaultSchema}].[ExperimentSession] ADD CONSTRAINT [DF___mj_ExperimentSession___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingRun */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingRun] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingRun */
UPDATE [${flyway:defaultSchema}].[MLTrainingRun] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingRun */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingRun] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingRun */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingRun] ADD CONSTRAINT [DF___mj_MLTrainingRun___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingRun */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingRun] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingRun */
UPDATE [${flyway:defaultSchema}].[MLTrainingRun] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingRun */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingRun] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingRun */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingRun] ADD CONSTRAINT [DF___mj_MLTrainingRun___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModelScoringBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModelScoringBinding */
UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModelScoringBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModelScoringBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding] ADD CONSTRAINT [DF___mj_MLModelScoringBinding___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModelScoringBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModelScoringBinding */
UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModelScoringBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModelScoringBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding] ADD CONSTRAINT [DF___mj_MLModelScoringBinding___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f43ad66-70e7-47c0-aa7a-3b70a0a829c0' OR (EntityID = '563629F3-3718-4A8D-A853-0337478A34FF' AND Name = 'ID')) BEGIN
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
            '8f43ad66-70e7-47c0-aa7a-3b70a0a829c0',
            '563629F3-3718-4A8D-A853-0337478A34FF', -- Entity: MJ: ML Algorithms
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3fdf43a7-7959-47f9-b300-98b939f4511f' OR (EntityID = '563629F3-3718-4A8D-A853-0337478A34FF' AND Name = 'Name')) BEGIN
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
            '3fdf43a7-7959-47f9-b300-98b939f4511f',
            '563629F3-3718-4A8D-A853-0337478A34FF', -- Entity: MJ: ML Algorithms
            100002,
            'Name',
            'Name',
            'Display name of the algorithm (e.g., "Gradient Boosting (XGBoost)", "Logistic Regression")',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8af50198-24eb-4a23-87cd-efe23d9006d1' OR (EntityID = '563629F3-3718-4A8D-A853-0337478A34FF' AND Name = 'Description')) BEGIN
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
            '8af50198-24eb-4a23-87cd-efe23d9006d1',
            '563629F3-3718-4A8D-A853-0337478A34FF', -- Entity: MJ: ML Algorithms
            100003,
            'Description',
            'Description',
            'Optional description of the algorithm and when to use it',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a33bd29-b6f2-472d-af94-11358449b70c' OR (EntityID = '563629F3-3718-4A8D-A853-0337478A34FF' AND Name = 'ProblemTypes')) BEGIN
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
            '1a33bd29-b6f2-472d-af94-11358449b70c',
            '563629F3-3718-4A8D-A853-0337478A34FF', -- Entity: MJ: ML Algorithms
            100004,
            'ProblemTypes',
            'Problem Types',
            'Comma-delimited list of supported problem types (e.g., "classification", "regression", or "classification,regression")',
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0db103b2-ed6b-4054-a48e-ec0b154e52cc' OR (EntityID = '563629F3-3718-4A8D-A853-0337478A34FF' AND Name = 'DriverClass')) BEGIN
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
            '0db103b2-ed6b-4054-a48e-ec0b154e52cc',
            '563629F3-3718-4A8D-A853-0337478A34FF', -- Entity: MJ: ML Algorithms
            100005,
            'DriverClass',
            'Driver Class',
            'Algorithm key passed to the Python training/inference sidecar (e.g., "xgboost", "lightgbm", "logistic_regression", "random_forest", "ridge", "mlp")',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b29bae0e-6510-420f-9774-d864a49f4b0c' OR (EntityID = '563629F3-3718-4A8D-A853-0337478A34FF' AND Name = 'HyperparameterSchema')) BEGIN
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
            'b29bae0e-6510-420f-9774-d864a49f4b0c',
            '563629F3-3718-4A8D-A853-0337478A34FF', -- Entity: MJ: ML Algorithms
            100006,
            'HyperparameterSchema',
            'Hyperparameter Schema',
            'JSON Schema describing the algorithm''s tunable hyperparameters (drives the UI form and validation)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8dd6157b-d52d-407d-90c2-ecc3a21c3b20' OR (EntityID = '563629F3-3718-4A8D-A853-0337478A34FF' AND Name = 'DefaultHyperparameters')) BEGIN
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
            '8dd6157b-d52d-407d-90c2-ecc3a21c3b20',
            '563629F3-3718-4A8D-A853-0337478A34FF', -- Entity: MJ: ML Algorithms
            100007,
            'DefaultHyperparameters',
            'Default Hyperparameters',
            'JSON object of default hyperparameter values applied when a pipeline does not override them',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7115641-2514-4a4e-9151-bfd89e9cd0c5' OR (EntityID = '563629F3-3718-4A8D-A853-0337478A34FF' AND Name = 'SupportsFeatureImportance')) BEGIN
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
            'a7115641-2514-4a4e-9151-bfd89e9cd0c5',
            '563629F3-3718-4A8D-A853-0337478A34FF', -- Entity: MJ: ML Algorithms
            100008,
            'SupportsFeatureImportance',
            'Supports Feature Importance',
            'When 1, the algorithm produces per-feature importance scores used for explainability and the leakage guard',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39dba86b-893a-4488-ae47-f330e9e25646' OR (EntityID = '563629F3-3718-4A8D-A853-0337478A34FF' AND Name = 'Status')) BEGIN
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
            '39dba86b-893a-4488-ae47-f330e9e25646',
            '563629F3-3718-4A8D-A853-0337478A34FF', -- Entity: MJ: ML Algorithms
            100009,
            'Status',
            'Status',
            'Lifecycle status: Active (selectable) or Deprecated',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68cde3ca-5971-4efa-8d63-85f94ab9c1e6' OR (EntityID = '563629F3-3718-4A8D-A853-0337478A34FF' AND Name = '__mj_CreatedAt')) BEGIN
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
            '68cde3ca-5971-4efa-8d63-85f94ab9c1e6',
            '563629F3-3718-4A8D-A853-0337478A34FF', -- Entity: MJ: ML Algorithms
            100010,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b212d3c4-d972-4f5a-a850-b36234212f7a' OR (EntityID = '563629F3-3718-4A8D-A853-0337478A34FF' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'b212d3c4-d972-4f5a-a850-b36234212f7a',
            '563629F3-3718-4A8D-A853-0337478A34FF', -- Entity: MJ: ML Algorithms
            100011,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0be0613-b808-4fc3-b593-f8d763262c09' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'ID')) BEGIN
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
            'f0be0613-b808-4fc3-b593-f8d763262c09',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '14cad8d8-92de-4592-9dab-3b6b48bf2831' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'Name')) BEGIN
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
            '14cad8d8-92de-4592-9dab-3b6b48bf2831',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100002,
            'Name',
            'Name',
            'Human-readable name of the pipeline',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1df0dc9-4682-4357-8c40-3d37ae5eef80' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'Description')) BEGIN
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
            'd1df0dc9-4682-4357-8c40-3d37ae5eef80',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100003,
            'Description',
            'Description',
            'Optional description of what this pipeline predicts and how',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a034660-bc06-4fb7-b360-4415cd779f93' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'Version')) BEGIN
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
            '4a034660-bc06-4fb7-b360-4415cd779f93',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100004,
            'Version',
            'Version',
            'Monotonic version number of the pipeline definition',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c2e70f5-97f9-4c56-86cc-a0f041abfcb3' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'Status')) BEGIN
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
            '9c2e70f5-97f9-4c56-86cc-a0f041abfcb3',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100005,
            'Status',
            'Status',
            'Lifecycle status: Draft, Published, or Archived',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Draft',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f00c9d6a-eca5-4dc6-95cf-2c3fb52d061b' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'TargetEntityID')) BEGIN
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
            'f00c9d6a-eca5-4dc6-95cf-2c3fb52d061b',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100006,
            'TargetEntityID',
            'Target Entity ID',
            'Foreign key to the entity whose records are the training units (e.g., Members)',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8945dab5-18e3-4936-88c3-76dbfe283706' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'TargetVariable')) BEGIN
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
            '8945dab5-18e3-4936-88c3-76dbfe283706',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100007,
            'TargetVariable',
            'Target Variable',
            'The label being predicted — a column or expression on the target entity (e.g., "Renewed")',
            'nvarchar',
            1000,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0737ec1a-58f8-4cdd-8482-d3f7309ac757' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'ProblemType')) BEGIN
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
            '0737ec1a-58f8-4cdd-8482-d3f7309ac757',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100008,
            'ProblemType',
            'Problem Type',
            'Problem type: classification or regression',
            'nvarchar',
            40,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4778a54a-db94-4134-9a46-fe57309b172a' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'AlgorithmID')) BEGIN
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
            '4778a54a-db94-4134-9a46-fe57309b172a',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100009,
            'AlgorithmID',
            'Algorithm ID',
            'Foreign key to the chosen algorithm in the catalog',
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
            '563629F3-3718-4A8D-A853-0337478A34FF',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7fa89e9f-63ff-45e5-986f-ac6fcb4addab' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'Hyperparameters')) BEGIN
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
            '7fa89e9f-63ff-45e5-986f-ac6fcb4addab',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100010,
            'Hyperparameters',
            'Hyperparameters',
            'JSON hyperparameter overrides for the chosen algorithm',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b66961e-4328-4246-ab47-b6fc7cb39a68' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'SourceBindings')) BEGIN
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
            '0b66961e-4328-4246-ab47-b6fc7cb39a68',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100011,
            'SourceBindings',
            'Source Bindings',
            'JSON ordered references to source entities / queries / external entities / vector sets the features are drawn from',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd77d0f1a-e5c5-4692-b80f-84a78a8a3b0e' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'FeatureSteps')) BEGIN
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
            'd77d0f1a-e5c5-4692-b80f-84a78a8a3b0e',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100012,
            'FeatureSteps',
            'Feature Steps',
            'JSON ordered DAG of FeatureAssembly steps (selection, null-handling, encoding, scaling, embedding/LLM featurization) executed by the single FeatureAssembly executor',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '97e5e102-6370-45d7-9df0-45b0404e5653' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'AsOfStrategy')) BEGIN
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
            '97e5e102-6370-45d7-9df0-45b0404e5653',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100013,
            'AsOfStrategy',
            'As Of Strategy',
            'JSON point-in-time configuration: { Mode: none|column|offset, Column?, OffsetDays? } — assembles features as of the decision point to prevent future leakage',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1a92e30-aa81-412f-8b35-d94d214793a6' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'LeakageGuard')) BEGIN
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
            'd1a92e30-aa81-412f-8b35-d94d214793a6',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100014,
            'LeakageGuard',
            'Leakage Guard',
            'JSON leakage guard: deny-list of fields/sources that must not enter features, plus the single-feature-dominance threshold that flags suspicious runs',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '083e1b09-e0c9-4a64-831a-25199ec089c6' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'ValidationStrategy')) BEGIN
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
            '083e1b09-e0c9-4a64-831a-25199ec089c6',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100015,
            'ValidationStrategy',
            'Validation Strategy',
            'JSON validation strategy: { Strategy: train_test_split|kfold|holdout, TestSize?, K?, LockedHoldoutFraction }',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c2cc900f-c5ba-4b87-a0e7-c67c763f992a' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = '__mj_CreatedAt')) BEGIN
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
            'c2cc900f-c5ba-4b87-a0e7-c67c763f992a',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100016,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e1ed9bc4-e871-4dc0-a0af-378c7745561d' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'e1ed9bc4-e871-4dc0-a0af-378c7745561d',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100017,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e418fc2c-c333-40a0-ab87-7bcf22e0d3a0' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'ID')) BEGIN
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
            'e418fc2c-c333-40a0-ab87-7bcf22e0d3a0',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '644dfc9e-d19f-432f-9d43-21bbe0c660d8' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'PipelineID')) BEGIN
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
            '644dfc9e-d19f-432f-9d43-21bbe0c660d8',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100002,
            'PipelineID',
            'Pipeline ID',
            'Foreign key to the ML Training Pipeline that produced this model (lineage)',
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
            '4ECBC565-5795-460A-AE61-083BD7799765',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0819e526-3f2b-4cc1-8aaf-c333e492d398' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'Version')) BEGIN
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
            '0819e526-3f2b-4cc1-8aaf-c333e492d398',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100003,
            'Version',
            'Version',
            'Monotonic version number of this model under its pipeline',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ffd971a-d247-4872-9e50-9d3a771d3c63' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'AlgorithmID')) BEGIN
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
            '7ffd971a-d247-4872-9e50-9d3a771d3c63',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100004,
            'AlgorithmID',
            'Algorithm ID',
            'Foreign key to the algorithm used to train this model',
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
            '563629F3-3718-4A8D-A853-0337478A34FF',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a63b59c5-0db4-4887-a1a3-ea70af57d80c' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'ArtifactFileID')) BEGIN
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
            'a63b59c5-0db4-4887-a1a3-ea70af57d80c',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100005,
            'ArtifactFileID',
            'Artifact File ID',
            'Foreign key to the MJ: Files record holding the serialized model artifact in MJStorage',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff2b5a2e-4493-4269-880e-d42dca4d3c43' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'FittedPreprocessing')) BEGIN
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
            'ff2b5a2e-4493-4269-880e-d42dca4d3c43',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100006,
            'FittedPreprocessing',
            'Fitted Preprocessing',
            'JSON of the fitted preprocessing parameters (means/std, one-hot vocabularies, bin edges, imputation fills) learned at training time and re-applied verbatim at inference — the anti train/serve skew payload',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b3c40c6-3d78-4418-8b1d-16b2b445bce2' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'FeatureSchema')) BEGIN
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
            '8b3c40c6-3d78-4418-8b1d-16b2b445bce2',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100007,
            'FeatureSchema',
            'Feature Schema',
            'JSON ordered list of feature names + kinds the model expects as input (the inference input contract)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f2f77f9-0f90-414e-9efe-f94278c886d4' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'TargetVariable')) BEGIN
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
            '0f2f77f9-0f90-414e-9efe-f94278c886d4',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100008,
            'TargetVariable',
            'Target Variable',
            'The label this model predicts',
            'nvarchar',
            1000,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e082d96-055e-47e1-ac7c-75dc337eac80' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'ProblemType')) BEGIN
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
            '6e082d96-055e-47e1-ac7c-75dc337eac80',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100009,
            'ProblemType',
            'Problem Type',
            'Problem type: classification or regression',
            'nvarchar',
            40,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de115685-dbd6-44b1-9159-09f1b53038fb' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'Metrics')) BEGIN
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
            'de115685-dbd6-44b1-9159-09f1b53038fb',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100010,
            'Metrics',
            'Metrics',
            'JSON of training + validation metrics (AUC, F1, accuracy, RMSE, etc.)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c8923270-5538-47b8-9e5e-644aa4dbaf4a' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'HoldoutMetrics')) BEGIN
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
            'c8923270-5538-47b8-9e5e-644aa4dbaf4a',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100011,
            'HoldoutMetrics',
            'Holdout Metrics',
            'JSON metrics on the locked holdout set the search never saw — scored exactly once for an honest performance number',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41693baa-747a-4580-875e-466818f0865a' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'FeatureImportance')) BEGIN
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
            '41693baa-747a-4580-875e-466818f0865a',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100012,
            'FeatureImportance',
            'Feature Importance',
            'JSON per-feature importance/contribution for explainability and the leakage guard',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4f94611-1396-4b3c-a0cb-52e2682ac1bb' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'Lineage')) BEGIN
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
            'd4f94611-1396-4b3c-a0cb-52e2682ac1bb',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100013,
            'Lineage',
            'Lineage',
            'JSON lineage: data version(s), pipeline version, source bindings, as-of date, sidecar version, and any embedding/LLM model versions used to build features',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bcdf39f8-2f99-4328-9418-bbd19a9b503e' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'TrainedAt')) BEGIN
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
            'bcdf39f8-2f99-4328-9418-bbd19a9b503e',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100014,
            'TrainedAt',
            'Trained At',
            'Timestamp when training completed',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ec6d6f5f-4a10-49eb-a00c-82d664f9b423' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'TrainingDurationSec')) BEGIN
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
            'ec6d6f5f-4a10-49eb-a00c-82d664f9b423',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100015,
            'TrainingDurationSec',
            'Training Duration Sec',
            'Wall-clock training duration in seconds',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb88b49e-6a49-45a4-9a53-5b33779da8c0' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'TrainingRowCount')) BEGIN
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
            'eb88b49e-6a49-45a4-9a53-5b33779da8c0',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100016,
            'TrainingRowCount',
            'Training Row Count',
            'Number of rows used to train the model',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c3635d2-ab83-4db9-9db7-dbd3047fab55' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'Status')) BEGIN
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
            '0c3635d2-ab83-4db9-9db7-dbd3047fab55',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100017,
            'Status',
            'Status',
            'Lifecycle status: Draft, Validated, Published, or Archived',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Draft',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d4336ba-fe40-45cf-958b-5444bb60ddc1' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = '__mj_CreatedAt')) BEGIN
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
            '6d4336ba-fe40-45cf-958b-5444bb60ddc1',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100018,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74c2ee68-b261-41cb-9d0f-6a3b276b41a5' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '74c2ee68-b261-41cb-9d0f-6a3b276b41a5',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100019,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c8ac8a2-293b-4488-b6a2-cd42a9eb50e6' OR (EntityID = 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C' AND Name = 'ID')) BEGIN
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
            '9c8ac8a2-293b-4488-b6a2-cd42a9eb50e6',
            'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C', -- Entity: MJ: ML Algorithm Use Cases
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16d0527f-b5c5-48e2-b67a-db0319e20e7d' OR (EntityID = 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C' AND Name = 'Name')) BEGIN
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
            '16d0527f-b5c5-48e2-b67a-db0319e20e7d',
            'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C', -- Entity: MJ: ML Algorithm Use Cases
            100002,
            'Name',
            'Name',
            'Display name of the scenario (e.g., "Interpretability required")',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c345d75-7f34-4bf1-88d8-c93cbe1037c0' OR (EntityID = 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C' AND Name = 'Description')) BEGIN
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
            '9c345d75-7f34-4bf1-88d8-c93cbe1037c0',
            'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C', -- Entity: MJ: ML Algorithm Use Cases
            100003,
            'Description',
            'Description',
            'Optional description of the scenario',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25a7f474-e3a0-4b78-906e-727e486f526f' OR (EntityID = 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C' AND Name = 'ProblemTypeScope')) BEGIN
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
            '25a7f474-e3a0-4b78-906e-727e486f526f',
            'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C', -- Entity: MJ: ML Algorithm Use Cases
            100004,
            'ProblemTypeScope',
            'Problem Type Scope',
            'Which problem type this scenario applies to: classification, regression, or any',
            'nvarchar',
            40,
            0,
            0,
            0,
            'any',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd13dd049-a037-4bd8-9586-232c0c1f336d' OR (EntityID = 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C' AND Name = 'Guidance')) BEGIN
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
            'd13dd049-a037-4bd8-9586-232c0c1f336d',
            'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C', -- Entity: MJ: ML Algorithm Use Cases
            100005,
            'Guidance',
            'Guidance',
            'Longer agent-readable guidance on when this scenario applies and what it implies for algorithm choice',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5a93dba-8ef0-4164-a49b-cc05983b4997' OR (EntityID = 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C' AND Name = 'DisplayOrder')) BEGIN
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
            'c5a93dba-8ef0-4164-a49b-cc05983b4997',
            'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C', -- Entity: MJ: ML Algorithm Use Cases
            100006,
            'DisplayOrder',
            'Display Order',
            'Ordering hint for displaying scenarios in the UI',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ff290ab-29b7-435b-8876-1b1bbe236d4c' OR (EntityID = 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C' AND Name = '__mj_CreatedAt')) BEGIN
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
            '0ff290ab-29b7-435b-8876-1b1bbe236d4c',
            'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C', -- Entity: MJ: ML Algorithm Use Cases
            100007,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b256b1f6-4810-4b9f-a881-f99eea533f90' OR (EntityID = 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'b256b1f6-4810-4b9f-a881-f99eea533f90',
            'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C', -- Entity: MJ: ML Algorithm Use Cases
            100008,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8286648e-4445-42d0-aaf8-f46df14d58e5' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'ID')) BEGIN
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
            '8286648e-4445-42d0-aaf8-f46df14d58e5',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ea3399e-fb75-4f0a-9a94-fe280362d597' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'ExperimentSessionID')) BEGIN
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
            '4ea3399e-fb75-4f0a-9a94-fe280362d597',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100002,
            'ExperimentSessionID',
            'Experiment Session ID',
            'Foreign key to the ExperimentSession this iteration belongs to',
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
            '7FD949B2-B950-464E-B702-B93D48709C0D',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f1253b94-4141-40fb-a635-bea0d9951fe7' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'Sequence')) BEGIN
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
            'f1253b94-4141-40fb-a635-bea0d9951fe7',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100003,
            'Sequence',
            'Sequence',
            'Order of this iteration within its session',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '07be7623-8ebc-446c-9ad6-8ca90a21f951' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'Label')) BEGIN
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
            '07be7623-8ebc-446c-9ad6-8ca90a21f951',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100004,
            'Label',
            'Label',
            'Optional human-readable label for the attempt (e.g., "XGBoost + engagement features")',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d7d3f5d-6b92-4ed8-a129-a2fe544a5a21' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'Status')) BEGIN
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
            '3d7d3f5d-6b92-4ed8-a129-a2fe544a5a21',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100005,
            'Status',
            'Status',
            'Iteration status: Pending, Running, Completed, Failed, or Pruned',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3f9bef6-4c79-4eb0-965d-f0ce561e2338' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'Score')) BEGIN
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
            'b3f9bef6-4c79-4eb0-965d-f0ce561e2338',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100006,
            'Score',
            'Score',
            'The normalized metric value this iteration achieved (the parent Experiment''s TargetMetric) — used to rank the leaderboard',
            'decimal',
            9,
            18,
            6,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c18a8916-55a5-44f3-bbef-c747c61f0b89' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'ComputeCost')) BEGIN
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
            'c18a8916-55a5-44f3-bbef-c747c61f0b89',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100007,
            'ComputeCost',
            'Compute Cost',
            'Compute cost attributed to this iteration, for budget enforcement',
            'decimal',
            9,
            18,
            6,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7fd055a1-826d-4f3e-b62f-15c9740f3d98' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'TokensUsed')) BEGIN
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
            '7fd055a1-826d-4f3e-b62f-15c9740f3d98',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100008,
            'TokensUsed',
            'Tokens Used',
            'LLM tokens used by this iteration (e.g., agent internal choice prompts), for budget enforcement',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0fd2c008-ceb4-4e9f-af0e-589abe4b4dea' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'Rationale')) BEGIN
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
            '0fd2c008-ceb4-4e9f-af0e-589abe4b4dea',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100009,
            'Rationale',
            'Rationale',
            'Why this iteration was tried (agent rationale) and any observations',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '93aa895a-7b21-4d34-ad2a-3b873f792903' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'AIAgentRunID')) BEGIN
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
            '93aa895a-7b21-4d34-ad2a-3b873f792903',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100010,
            'AIAgentRunID',
            'AI Agent Run ID',
            'Optional foreign key to the MJ: AI Agent Run that executed this iteration (NULL when executed by deterministic code with no dedicated agent run)',
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
            '5190AF93-4C39-4429-BDAA-0AEB492A0256',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '859936ed-6f51-4852-8d1b-61117f039805' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = '__mj_CreatedAt')) BEGIN
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
            '859936ed-6f51-4852-8d1b-61117f039805',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100011,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ba6ad7d-ce62-469d-866e-9c42179eb452' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '3ba6ad7d-ce62-469d-866e-9c42179eb452',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100012,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '91df60af-6635-4b63-9b6d-57018245d8cd' OR (EntityID = 'B134A583-9297-4399-9234-7B1B223DB2C7' AND Name = 'ID')) BEGIN
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
            '91df60af-6635-4b63-9b6d-57018245d8cd',
            'B134A583-9297-4399-9234-7B1B223DB2C7', -- Entity: MJ: Experiments
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81971d05-8e1f-4838-8511-23fd458fa8e5' OR (EntityID = 'B134A583-9297-4399-9234-7B1B223DB2C7' AND Name = 'Name')) BEGIN
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
            '81971d05-8e1f-4838-8511-23fd458fa8e5',
            'B134A583-9297-4399-9234-7B1B223DB2C7', -- Entity: MJ: Experiments
            100002,
            'Name',
            'Name',
            'Human-readable name of the experiment',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4fa8d574-3e4d-4ce7-af42-4cd4ddd9aaa2' OR (EntityID = 'B134A583-9297-4399-9234-7B1B223DB2C7' AND Name = 'Description')) BEGIN
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
            '4fa8d574-3e4d-4ce7-af42-4cd4ddd9aaa2',
            'B134A583-9297-4399-9234-7B1B223DB2C7', -- Entity: MJ: Experiments
            100003,
            'Description',
            'Description',
            'Optional description of the experiment',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '46b8c3c5-5898-4fc2-9f52-2d5fa42b2b8c' OR (EntityID = 'B134A583-9297-4399-9234-7B1B223DB2C7' AND Name = 'ExperimentType')) BEGIN
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
            '46b8c3c5-5898-4fc2-9f52-2d5fa42b2b8c',
            'B134A583-9297-4399-9234-7B1B223DB2C7', -- Entity: MJ: Experiments
            100004,
            'ExperimentType',
            'Experiment Type',
            'Discriminator naming the kind of experiment / consuming subsystem (e.g., "MLModelSearch", "PromptOptimization", "AgentConfigSearch"). Intentionally an open NVARCHAR (no CHECK constraint) so new consumers can introduce types without a schema migration.',
            'nvarchar',
            100,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4afe2c2-30de-41ec-acc5-2c8cad2f08e9' OR (EntityID = 'B134A583-9297-4399-9234-7B1B223DB2C7' AND Name = 'Goal')) BEGIN
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
            'a4afe2c2-30de-41ec-acc5-2c8cad2f08e9',
            'B134A583-9297-4399-9234-7B1B223DB2C7', -- Entity: MJ: Experiments
            100005,
            'Goal',
            'Goal',
            'Natural-language objective of the experiment (e.g., "maximize holdout AUC for renewal prediction")',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5bbfa945-4b8b-4b79-9009-013ee14d02ac' OR (EntityID = 'B134A583-9297-4399-9234-7B1B223DB2C7' AND Name = 'TargetMetric')) BEGIN
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
            '5bbfa945-4b8b-4b79-9009-013ee14d02ac',
            'B134A583-9297-4399-9234-7B1B223DB2C7', -- Entity: MJ: Experiments
            100006,
            'TargetMetric',
            'Target Metric',
            'The metric the experiment optimizes (e.g., "AUC", "F1", "RMSE") — the normalized number iterations are scored and ranked by',
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5abdfca-472a-4b0e-b79e-6c643b0218d8' OR (EntityID = 'B134A583-9297-4399-9234-7B1B223DB2C7' AND Name = 'PlanSpecTemplate')) BEGIN
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
            'e5abdfca-472a-4b0e-b79e-6c643b0218d8',
            'B134A583-9297-4399-9234-7B1B223DB2C7', -- Entity: MJ: Experiments
            100007,
            'PlanSpecTemplate',
            'Plan Spec Template',
            'Optional JSON reusable plan template that seeds new sessions'' PlanSpec (consumer-specific shape; opaque to the generic substrate)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b45c5471-d226-4f0e-92f7-b4b0970aa0c4' OR (EntityID = 'B134A583-9297-4399-9234-7B1B223DB2C7' AND Name = 'Status')) BEGIN
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
            'b45c5471-d226-4f0e-92f7-b4b0970aa0c4',
            'B134A583-9297-4399-9234-7B1B223DB2C7', -- Entity: MJ: Experiments
            100008,
            'Status',
            'Status',
            'Lifecycle status: Active or Archived',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '864143ab-25df-45d0-bdd8-d903c1d38393' OR (EntityID = 'B134A583-9297-4399-9234-7B1B223DB2C7' AND Name = '__mj_CreatedAt')) BEGIN
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
            '864143ab-25df-45d0-bdd8-d903c1d38393',
            'B134A583-9297-4399-9234-7B1B223DB2C7', -- Entity: MJ: Experiments
            100009,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'beb952b4-c0ba-41e0-bac3-f6df8673ea36' OR (EntityID = 'B134A583-9297-4399-9234-7B1B223DB2C7' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'beb952b4-c0ba-41e0-bac3-f6df8673ea36',
            'B134A583-9297-4399-9234-7B1B223DB2C7', -- Entity: MJ: Experiments
            100010,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce1562a9-4f8e-45eb-bd4b-05d4fc9675ba' OR (EntityID = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C' AND Name = 'ID')) BEGIN
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
            'ce1562a9-4f8e-45eb-bd4b-05d4fc9675ba',
            'A3D384C6-AF3E-499A-9522-86FC1E58F15C', -- Entity: MJ: ML Algorithm Use Case Rankings
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8241724e-4838-4e2c-ad11-20379437f277' OR (EntityID = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C' AND Name = 'MLAlgorithmID')) BEGIN
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
            '8241724e-4838-4e2c-ad11-20379437f277',
            'A3D384C6-AF3E-499A-9522-86FC1E58F15C', -- Entity: MJ: ML Algorithm Use Case Rankings
            100002,
            'MLAlgorithmID',
            'ML Algorithm ID',
            'Foreign key to the algorithm being ranked',
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
            '563629F3-3718-4A8D-A853-0337478A34FF',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0130d794-be82-4c28-afb8-5446daae2236' OR (EntityID = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C' AND Name = 'MLAlgorithmUseCaseID')) BEGIN
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
            '0130d794-be82-4c28-afb8-5446daae2236',
            'A3D384C6-AF3E-499A-9522-86FC1E58F15C', -- Entity: MJ: ML Algorithm Use Case Rankings
            100003,
            'MLAlgorithmUseCaseID',
            'ML Algorithm Use Case ID',
            'Foreign key to the use-case scenario the algorithm is ranked for',
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
            'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f53bfb1-6760-49aa-832b-81bf65b8c726' OR (EntityID = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C' AND Name = 'SuitabilityScore')) BEGIN
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
            '0f53bfb1-6760-49aa-832b-81bf65b8c726',
            'A3D384C6-AF3E-499A-9522-86FC1E58F15C', -- Entity: MJ: ML Algorithm Use Case Rankings
            100004,
            'SuitabilityScore',
            'Suitability Score',
            'Numeric suitability for sorting/ranking, 1 (worst) to 5 (best)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44071858-8bfd-4bd6-b07b-2693724f8d1d' OR (EntityID = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C' AND Name = 'RecommendationLevel')) BEGIN
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
            '44071858-8bfd-4bd6-b07b-2693724f8d1d',
            'A3D384C6-AF3E-499A-9522-86FC1E58F15C', -- Entity: MJ: ML Algorithm Use Case Rankings
            100005,
            'RecommendationLevel',
            'Recommendation Level',
            'Categorical recommendation: Primary, Strong, Viable, Weak, or NotRecommended',
            'nvarchar',
            40,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5af056c9-962f-484e-94da-d5bfcca31584' OR (EntityID = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C' AND Name = 'Rationale')) BEGIN
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
            '5af056c9-962f-484e-94da-d5bfcca31584',
            'A3D384C6-AF3E-499A-9522-86FC1E58F15C', -- Entity: MJ: ML Algorithm Use Case Rankings
            100006,
            'Rationale',
            'Rationale',
            'Plain-language explanation of the ranking, readable by both agents and humans (e.g., "Gives feature importances but not simple coefficients — if a stakeholder needs to see exactly why each prediction was made, prefer Logistic/Ridge.")',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1ab1494-4849-4545-82f3-b82f043c8ae0' OR (EntityID = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C' AND Name = '__mj_CreatedAt')) BEGIN
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
            'c1ab1494-4849-4545-82f3-b82f043c8ae0',
            'A3D384C6-AF3E-499A-9522-86FC1E58F15C', -- Entity: MJ: ML Algorithm Use Case Rankings
            100007,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9039ae87-3f07-43b2-800a-229bc2609930' OR (EntityID = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '9039ae87-3f07-43b2-800a-229bc2609930',
            'A3D384C6-AF3E-499A-9522-86FC1E58F15C', -- Entity: MJ: ML Algorithm Use Case Rankings
            100008,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a2566ef-95db-4632-a8d7-1f316b8cf98a' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = 'ID')) BEGIN
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
            '8a2566ef-95db-4632-a8d7-1f316b8cf98a',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd97e499f-298b-49d7-ba26-b54cb38f84bc' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = 'ExperimentID')) BEGIN
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
            'd97e499f-298b-49d7-ba26-b54cb38f84bc',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100002,
            'ExperimentID',
            'Experiment ID',
            'Foreign key to the Experiment definition this session executes',
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
            'B134A583-9297-4399-9234-7B1B223DB2C7',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6af2dbf-00a3-48ae-9f30-420db8b884f4' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = 'Name')) BEGIN
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
            'f6af2dbf-00a3-48ae-9f30-420db8b884f4',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100003,
            'Name',
            'Name',
            'Human-readable name of this session/execution',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de4fb047-ba55-4844-b7a6-93b008d4cd61' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = 'Goal')) BEGIN
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
            'de4fb047-ba55-4844-b7a6-93b008d4cd61',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100004,
            'Goal',
            'Goal',
            'Optional per-session objective override (defaults to the parent Experiment''s Goal)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5edd86fe-9343-4338-9f81-6f5e55e22e9e' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = 'Budget')) BEGIN
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
            '5edd86fe-9343-4338-9f81-6f5e55e22e9e',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100005,
            'Budget',
            'Budget',
            'JSON budget bounding autonomy for this session: max compute-cost / max iterations / max wallclock',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '343bb07a-dcf9-40cb-bd40-85b6835bd0bb' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = 'Status')) BEGIN
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
            '343bb07a-dcf9-40cb-bd40-85b6835bd0bb',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100006,
            'Status',
            'Status',
            'Lifecycle status: Planning, AwaitingApproval, Running, Paused, Completed, or Cancelled',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Planning',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '89513be6-ab8e-4590-9202-a7544826dffa' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = 'PlanSpec')) BEGIN
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
            '89513be6-ab8e-4590-9202-a7544826dffa',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100007,
            'PlanSpec',
            'Plan Spec',
            'JSON of the approved plan the deterministic orchestrator executes for this session (consumer-specific shape; for Predictive Studio this is the ModelingPlanSpec). Opaque to the generic substrate.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e988426b-4094-4a23-b62a-2a8451c537d7' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = 'Leaderboard')) BEGIN
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
            'e988426b-4094-4a23-b62a-2a8451c537d7',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100008,
            'Leaderboard',
            'Leaderboard',
            'JSON snapshot of the best iterations so far (also derivable from ExperimentSessionIteration scores)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d2f1787-9140-44e4-a6a6-f7bc7cf3f6ea' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = 'AgentRunID')) BEGIN
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
            '7d2f1787-9140-44e4-a6a6-f7bc7cf3f6ea',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100009,
            'AgentRunID',
            'Agent Run ID',
            'Foreign key to the MJ: AI Agent Run that owns/drives this session',
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
            '5190AF93-4C39-4429-BDAA-0AEB492A0256',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '600b836f-2ab8-4baa-895b-2c289bb27dc7' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = '__mj_CreatedAt')) BEGIN
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
            '600b836f-2ab8-4baa-895b-2c289bb27dc7',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100010,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80a5f50e-28e9-4043-bdfe-9fb8aabeaf3b' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '80a5f50e-28e9-4043-bdfe-9fb8aabeaf3b',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100011,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '48e00241-9dae-4ce2-bcb4-cc6557ef4b71' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'ID')) BEGIN
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
            '48e00241-9dae-4ce2-bcb4-cc6557ef4b71',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5909321d-c26e-452b-b677-8643585dd22c' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'PipelineID')) BEGIN
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
            '5909321d-c26e-452b-b677-8643585dd22c',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100002,
            'PipelineID',
            'Pipeline ID',
            'Foreign key to the ML Training Pipeline this run executed',
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
            '4ECBC565-5795-460A-AE61-083BD7799765',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5d231e5-d45e-461e-aeed-8b235e4bbf02' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'ResultingModelID')) BEGIN
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
            'c5d231e5-d45e-461e-aeed-8b235e4bbf02',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100003,
            'ResultingModelID',
            'Resulting Model ID',
            'Foreign key to the MLModel this run produced, when it produced one (NULL for pruned/failed runs)',
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
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '50d2d468-9d65-4961-9fbc-8ac8b304fe91' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'ExperimentSessionIterationID')) BEGIN
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
            '50d2d468-9d65-4961-9fbc-8ac8b304fe91',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100004,
            'ExperimentSessionIterationID',
            'Experiment Session Iteration ID',
            'Optional foreign key to the generic ExperimentSessionIteration that owns this run (NULL for standalone/manual training outside a session)',
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
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7065d7d4-c1bf-4092-b6d6-6c76920c13ba' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'FeaturesUsed')) BEGIN
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
            '7065d7d4-c1bf-4092-b6d6-6c76920c13ba',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100005,
            'FeaturesUsed',
            'Features Used',
            'JSON of the exact feature set used for this run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5cf7df3-1023-4030-84f4-dce22edd62b0' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'AlgorithmID')) BEGIN
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
            'f5cf7df3-1023-4030-84f4-dce22edd62b0',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100006,
            'AlgorithmID',
            'Algorithm ID',
            'Foreign key to the algorithm used for this run',
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
            '563629F3-3718-4A8D-A853-0337478A34FF',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff6fcde3-8b53-4d04-9e1c-1ecf2f9c6a0d' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'Hyperparameters')) BEGIN
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
            'ff6fcde3-8b53-4d04-9e1c-1ecf2f9c6a0d',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100007,
            'Hyperparameters',
            'Hyperparameters',
            'JSON hyperparameters used for this run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3c6bd38-b3e7-47ca-bafe-50c3ca8670e6' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'ValidationResults')) BEGIN
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
            'e3c6bd38-b3e7-47ca-bafe-50c3ca8670e6',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100008,
            'ValidationResults',
            'Validation Results',
            'JSON of all validation metrics, per-fold where applicable (the full metric blob; the parent iteration''s Score is the single normalized leaderboard number)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03868be5-fbdc-4e0f-ac49-4c2a6e77b7ea' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'Status')) BEGIN
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
            '03868be5-fbdc-4e0f-ac49-4c2a6e77b7ea',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100009,
            'Status',
            'Status',
            'Run status: Pending, Running, Completed, Failed, or Pruned',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '72941a73-0772-4e15-8031-257bd8565946' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'StartedAt')) BEGIN
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
            '72941a73-0772-4e15-8031-257bd8565946',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100010,
            'StartedAt',
            'Started At',
            'Timestamp the run started',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '763b1c26-74ba-4d01-b106-9d75bb8d076a' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'CompletedAt')) BEGIN
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
            '763b1c26-74ba-4d01-b106-9d75bb8d076a',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100011,
            'CompletedAt',
            'Completed At',
            'Timestamp the run completed',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '116d5683-8ff0-4c11-afa5-3359487fc9d3' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'ComputeCost')) BEGIN
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
            '116d5683-8ff0-4c11-afa5-3359487fc9d3',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100012,
            'ComputeCost',
            'Compute Cost',
            'Compute cost attributed to this run, for budget enforcement',
            'decimal',
            9,
            18,
            6,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6cd41a8-c4fa-4385-8fbe-41f1174000cf' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'TokensUsed')) BEGIN
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
            'a6cd41a8-c4fa-4385-8fbe-41f1174000cf',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100013,
            'TokensUsed',
            'Tokens Used',
            'LLM tokens used by this run, for budget enforcement',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f42599c-fde7-4da8-a7d0-4d9da863a162' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'Notes')) BEGIN
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
            '6f42599c-fde7-4da8-a7d0-4d9da863a162',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100014,
            'Notes',
            'Notes',
            'Notes / observations about this run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a58306de-b5e4-496e-85f3-43e3d9d23a5a' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = '__mj_CreatedAt')) BEGIN
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
            'a58306de-b5e4-496e-85f3-43e3d9d23a5a',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100015,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ba9e946-5d56-4020-bb4c-5150992f8c84' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0ba9e946-5d56-4020-bb4c-5150992f8c84',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100016,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc4d8167-8e2c-4119-a3e3-896f0e31847a' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = 'ID')) BEGIN
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
            'bc4d8167-8e2c-4119-a3e3-896f0e31847a',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d29e295-c2bf-4168-9587-85802de7278d' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = 'MLModelID')) BEGIN
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
            '9d29e295-c2bf-4168-9587-85802de7278d',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100002,
            'MLModelID',
            'ML Model ID',
            'Foreign key to the MLModel that does the scoring',
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
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ed5a18f-cea7-4bae-bcce-678324c3e825' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = 'RecordProcessID')) BEGIN
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
            '9ed5a18f-cea7-4bae-bcce-678324c3e825',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100003,
            'RecordProcessID',
            'Record Process ID',
            'Foreign key to the Record Process that runs the ML inference work for this binding',
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
            'BDE34DF9-7B59-4921-9B80-E94BC013A5BB',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e1858cc5-bb1a-45fc-8420-1caf542afc37' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = 'TargetEntityID')) BEGIN
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
            'e1858cc5-bb1a-45fc-8420-1caf542afc37',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100004,
            'TargetEntityID',
            'Target Entity ID',
            'Foreign key to the entity that receives the prediction (when scores are written back)',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1233240e-257e-48bc-aba2-4a08ef02bcdf' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = 'TargetColumn')) BEGIN
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
            '1233240e-257e-48bc-aba2-4a08ef02bcdf',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100005,
            'TargetColumn',
            'Target Column',
            'Name of the column that receives the prediction (when scores are written back / materialized)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c36bd154-d8ff-4381-9eda-0630e06ad702' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = 'Mode')) BEGIN
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
            'c36bd154-d8ff-4381-9eda-0630e06ad702',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100006,
            'Mode',
            'Mode',
            'Scoring mode: OnDemand, Scheduled, or Materialized',
            'nvarchar',
            40,
            0,
            0,
            0,
            'OnDemand',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61581a94-4cc7-4c16-a215-3c0c10fced2d' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = 'MaterializedResultID')) BEGIN
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
            '61581a94-4cc7-4c16-a215-3c0c10fced2d',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100007,
            'MaterializedResultID',
            'Materialized Result ID',
            'Soft reference to a MJ: Materialized Results row (PR #2770) when Mode=Materialized; not a FK until that table exists',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '210d8daa-6ef5-428d-8431-25bb0b710c0d' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = 'LastScoredAt')) BEGIN
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
            '210d8daa-6ef5-428d-8431-25bb0b710c0d',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100008,
            'LastScoredAt',
            'Last Scored At',
            'Timestamp of the most recent scoring run for this binding',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f2a462c-d209-4425-a3b6-9c07789d5eaa' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = 'LastRowCount')) BEGIN
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
            '5f2a462c-d209-4425-a3b6-9c07789d5eaa',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100009,
            'LastRowCount',
            'Last Row Count',
            'Number of records scored in the most recent scoring run',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa0d40cd-ddfb-41a1-bcb1-abee9f942395' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = '__mj_CreatedAt')) BEGIN
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
            'fa0d40cd-ddfb-41a1-bcb1-abee9f942395',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100010,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b6cfc24-0d96-403e-8733-5c1f89398b52' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '2b6cfc24-0d96-403e-8733-5c1f89398b52',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100011,
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

/* SQL text to insert entity field value with ID fea83a31-9a43-431c-abde-47aec2ecb2c7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fea83a31-9a43-431c-abde-47aec2ecb2c7', 'C36BD154-D8FF-4381-9EDA-0630E06AD702', 1, 'Materialized', 'Materialized', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0b4c029e-3583-4477-b015-9f4af002d2f2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0b4c029e-3583-4477-b015-9f4af002d2f2', 'C36BD154-D8FF-4381-9EDA-0630E06AD702', 2, 'OnDemand', 'OnDemand', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a9265942-dd1f-46f3-abab-f4434b0ff33b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a9265942-dd1f-46f3-abab-f4434b0ff33b', 'C36BD154-D8FF-4381-9EDA-0630E06AD702', 3, 'Scheduled', 'Scheduled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C36BD154-D8FF-4381-9EDA-0630E06AD702 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C36BD154-D8FF-4381-9EDA-0630E06AD702';

/* SQL text to insert entity field value with ID af223997-c4b2-4878-88eb-09bf3d69ca54 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('af223997-c4b2-4878-88eb-09bf3d69ca54', '39DBA86B-893A-4488-AE47-F330E9E25646', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 96cadda7-4af5-4fa3-aec8-b661349921f4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('96cadda7-4af5-4fa3-aec8-b661349921f4', '39DBA86B-893A-4488-AE47-F330E9E25646', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 39DBA86B-893A-4488-AE47-F330E9E25646 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='39DBA86B-893A-4488-AE47-F330E9E25646';

/* SQL text to insert entity field value with ID 4ec08276-c3d6-4cb1-9efe-6b53f6a1629b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4ec08276-c3d6-4cb1-9efe-6b53f6a1629b', '25A7F474-E3A0-4B78-906E-727E486F526F', 1, 'any', 'any', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1cb13f8a-a9c7-4e0a-b248-432f440d9300 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1cb13f8a-a9c7-4e0a-b248-432f440d9300', '25A7F474-E3A0-4B78-906E-727E486F526F', 2, 'classification', 'classification', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a09d63df-de81-41d5-abed-d4bf81a4147f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a09d63df-de81-41d5-abed-d4bf81a4147f', '25A7F474-E3A0-4B78-906E-727E486F526F', 3, 'regression', 'regression', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 25A7F474-E3A0-4B78-906E-727E486F526F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='25A7F474-E3A0-4B78-906E-727E486F526F';

/* SQL text to insert entity field value with ID 82bdbf54-2843-4228-b56b-e55da3289719 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('82bdbf54-2843-4228-b56b-e55da3289719', '44071858-8BFD-4BD6-B07B-2693724F8D1D', 1, 'NotRecommended', 'NotRecommended', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 289e7ad3-4890-4dcd-b382-ced8d45add9e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('289e7ad3-4890-4dcd-b382-ced8d45add9e', '44071858-8BFD-4BD6-B07B-2693724F8D1D', 2, 'Primary', 'Primary', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f761831a-5494-46fe-8e10-46042143a443 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f761831a-5494-46fe-8e10-46042143a443', '44071858-8BFD-4BD6-B07B-2693724F8D1D', 3, 'Strong', 'Strong', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 61c532cf-6ea9-402f-8c5d-498a2dcfc64c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('61c532cf-6ea9-402f-8c5d-498a2dcfc64c', '44071858-8BFD-4BD6-B07B-2693724F8D1D', 4, 'Viable', 'Viable', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5f0c6ae7-2844-46c6-8b34-747c1f4c5ed1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5f0c6ae7-2844-46c6-8b34-747c1f4c5ed1', '44071858-8BFD-4BD6-B07B-2693724F8D1D', 5, 'Weak', 'Weak', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 44071858-8BFD-4BD6-B07B-2693724F8D1D */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='44071858-8BFD-4BD6-B07B-2693724F8D1D';

/* SQL text to insert entity field value with ID 9fa0de44-d8de-4456-bf0d-11bd13848e72 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9fa0de44-d8de-4456-bf0d-11bd13848e72', '9C2E70F5-97F9-4C56-86CC-A0F041ABFCB3', 1, 'Archived', 'Archived', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ded2281f-57c8-4831-82f5-9e2aa859f440 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ded2281f-57c8-4831-82f5-9e2aa859f440', '9C2E70F5-97F9-4C56-86CC-A0F041ABFCB3', 2, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ed038a72-d84a-429b-9a9b-8028a518bf5f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ed038a72-d84a-429b-9a9b-8028a518bf5f', '9C2E70F5-97F9-4C56-86CC-A0F041ABFCB3', 3, 'Published', 'Published', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 9C2E70F5-97F9-4C56-86CC-A0F041ABFCB3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='9C2E70F5-97F9-4C56-86CC-A0F041ABFCB3';

/* SQL text to insert entity field value with ID 06393ad6-cf33-4a46-81aa-e2fc99a23542 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('06393ad6-cf33-4a46-81aa-e2fc99a23542', '0737EC1A-58F8-4CDD-8482-D3F7309AC757', 1, 'classification', 'classification', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dd282404-4e63-4e8f-8a46-f94510b53d89 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dd282404-4e63-4e8f-8a46-f94510b53d89', '0737EC1A-58F8-4CDD-8482-D3F7309AC757', 2, 'regression', 'regression', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0737EC1A-58F8-4CDD-8482-D3F7309AC757 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0737EC1A-58F8-4CDD-8482-D3F7309AC757';

/* SQL text to insert entity field value with ID 07ca0515-c7a0-4e4d-abd5-39c5d0848f21 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('07ca0515-c7a0-4e4d-abd5-39c5d0848f21', '6E082D96-055E-47E1-AC7C-75DC337EAC80', 1, 'classification', 'classification', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4fa81218-f813-4b3a-8aa7-7c46c37428b9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4fa81218-f813-4b3a-8aa7-7c46c37428b9', '6E082D96-055E-47E1-AC7C-75DC337EAC80', 2, 'regression', 'regression', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 6E082D96-055E-47E1-AC7C-75DC337EAC80 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6E082D96-055E-47E1-AC7C-75DC337EAC80';

/* SQL text to insert entity field value with ID 077b6add-67f1-4d4f-ad8f-ef08e5f67800 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('077b6add-67f1-4d4f-ad8f-ef08e5f67800', '0C3635D2-AB83-4DB9-9DB7-DBD3047FAB55', 1, 'Archived', 'Archived', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1b695661-2535-43d1-b37a-8ec62d98d08f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1b695661-2535-43d1-b37a-8ec62d98d08f', '0C3635D2-AB83-4DB9-9DB7-DBD3047FAB55', 2, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 28b1566b-947c-4476-b3db-8b93f6efc002 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('28b1566b-947c-4476-b3db-8b93f6efc002', '0C3635D2-AB83-4DB9-9DB7-DBD3047FAB55', 3, 'Published', 'Published', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dee80c69-59f3-4ceb-a838-8ba81b3da386 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dee80c69-59f3-4ceb-a838-8ba81b3da386', '0C3635D2-AB83-4DB9-9DB7-DBD3047FAB55', 4, 'Validated', 'Validated', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0C3635D2-AB83-4DB9-9DB7-DBD3047FAB55 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0C3635D2-AB83-4DB9-9DB7-DBD3047FAB55';

/* SQL text to insert entity field value with ID 371c2797-45de-4675-a8b5-5e4166d4aa2b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('371c2797-45de-4675-a8b5-5e4166d4aa2b', 'B45C5471-D226-4F0E-92F7-B4B0970AA0C4', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID be552bb1-0a34-4a00-923b-a97960765775 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('be552bb1-0a34-4a00-923b-a97960765775', 'B45C5471-D226-4F0E-92F7-B4B0970AA0C4', 2, 'Archived', 'Archived', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B45C5471-D226-4F0E-92F7-B4B0970AA0C4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B45C5471-D226-4F0E-92F7-B4B0970AA0C4';

/* SQL text to insert entity field value with ID 4e1977bb-9115-480a-9b3e-e56f305280cc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4e1977bb-9115-480a-9b3e-e56f305280cc', '343BB07A-DCF9-40CB-BD40-85B6835BD0BB', 1, 'AwaitingApproval', 'AwaitingApproval', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 854bb2da-fbf9-4f4b-bb78-50ada8f6fd09 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('854bb2da-fbf9-4f4b-bb78-50ada8f6fd09', '343BB07A-DCF9-40CB-BD40-85B6835BD0BB', 2, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4c3df6b0-51e5-46e8-866b-567affea28ec */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4c3df6b0-51e5-46e8-866b-567affea28ec', '343BB07A-DCF9-40CB-BD40-85B6835BD0BB', 3, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fcea83d7-86b9-46f2-b5f4-522b4910fb87 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fcea83d7-86b9-46f2-b5f4-522b4910fb87', '343BB07A-DCF9-40CB-BD40-85B6835BD0BB', 4, 'Paused', 'Paused', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f17368d6-255a-41a4-851d-d1cedbc21f57 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f17368d6-255a-41a4-851d-d1cedbc21f57', '343BB07A-DCF9-40CB-BD40-85B6835BD0BB', 5, 'Planning', 'Planning', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d3f44420-62e0-46eb-bac6-1d6f6a549f6e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d3f44420-62e0-46eb-bac6-1d6f6a549f6e', '343BB07A-DCF9-40CB-BD40-85B6835BD0BB', 6, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 343BB07A-DCF9-40CB-BD40-85B6835BD0BB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='343BB07A-DCF9-40CB-BD40-85B6835BD0BB';

/* SQL text to insert entity field value with ID a66acea0-78cd-4436-a8f4-ece66f102654 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a66acea0-78cd-4436-a8f4-ece66f102654', '3D7D3F5D-6B92-4ED8-A129-A2FE544A5A21', 1, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9766c75e-f8be-4031-a35c-a157d7bbc457 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9766c75e-f8be-4031-a35c-a157d7bbc457', '3D7D3F5D-6B92-4ED8-A129-A2FE544A5A21', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9c964a7e-5410-4f01-94f8-4552e0175dda */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9c964a7e-5410-4f01-94f8-4552e0175dda', '3D7D3F5D-6B92-4ED8-A129-A2FE544A5A21', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9e2d7f7c-1da5-49c4-aecf-b7763d57c4ac */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9e2d7f7c-1da5-49c4-aecf-b7763d57c4ac', '3D7D3F5D-6B92-4ED8-A129-A2FE544A5A21', 4, 'Pruned', 'Pruned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0164392a-8f72-4422-b3d7-0dec38d333dd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0164392a-8f72-4422-b3d7-0dec38d333dd', '3D7D3F5D-6B92-4ED8-A129-A2FE544A5A21', 5, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3D7D3F5D-6B92-4ED8-A129-A2FE544A5A21 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3D7D3F5D-6B92-4ED8-A129-A2FE544A5A21';

/* SQL text to insert entity field value with ID 4a93d8ee-9e19-42cc-bff9-148149ed3e42 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4a93d8ee-9e19-42cc-bff9-148149ed3e42', '03868BE5-FBDC-4E0F-AC49-4C2A6E77B7EA', 1, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 13aeb99b-45f2-48ea-95b7-81b75ba8ea20 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('13aeb99b-45f2-48ea-95b7-81b75ba8ea20', '03868BE5-FBDC-4E0F-AC49-4C2A6E77B7EA', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID feda9def-dd04-4f5c-83e4-bf07a4085453 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('feda9def-dd04-4f5c-83e4-bf07a4085453', '03868BE5-FBDC-4E0F-AC49-4C2A6E77B7EA', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8235ce33-2971-4e10-bb11-485a7edb6435 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8235ce33-2971-4e10-bb11-485a7edb6435', '03868BE5-FBDC-4E0F-AC49-4C2A6E77B7EA', 4, 'Pruned', 'Pruned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5be88dec-2524-46de-a1fc-a859eb83fc55 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5be88dec-2524-46de-a1fc-a859eb83fc55', '03868BE5-FBDC-4E0F-AC49-4C2A6E77B7EA', 5, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 03868BE5-FBDC-4E0F-AC49-4C2A6E77B7EA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='03868BE5-FBDC-4E0F-AC49-4C2A6E77B7EA';


/* Create Entity Relationship: MJ: ML Algorithms -> MJ: ML Training Pipelines (One To Many via AlgorithmID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '93922186-88d5-451a-badf-cf6a2c0f3a0c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('93922186-88d5-451a-badf-cf6a2c0f3a0c', '563629F3-3718-4A8D-A853-0337478A34FF', '4ECBC565-5795-460A-AE61-083BD7799765', 'AlgorithmID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Algorithms -> MJ: ML Models (One To Many via AlgorithmID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a106d4f6-0e9a-4143-9d34-c6690934028a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a106d4f6-0e9a-4143-9d34-c6690934028a', '563629F3-3718-4A8D-A853-0337478A34FF', '109EDF71-1995-4A46-8EC8-09C2C2FF5310', 'AlgorithmID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Algorithms -> MJ: ML Algorithm Use Case Rankings (One To Many via MLAlgorithmID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ed149db2-7904-456e-9ec3-8ce23a4e3de8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ed149db2-7904-456e-9ec3-8ce23a4e3de8', '563629F3-3718-4A8D-A853-0337478A34FF', 'A3D384C6-AF3E-499A-9522-86FC1E58F15C', 'MLAlgorithmID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Algorithms -> MJ: ML Training Runs (One To Many via AlgorithmID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'edd1cfda-a753-4b28-85db-bc3b9a9a2094'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('edd1cfda-a753-4b28-85db-bc3b9a9a2094', '563629F3-3718-4A8D-A853-0337478A34FF', 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', 'AlgorithmID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Pipelines -> MJ: ML Training Runs (One To Many via PipelineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '10f0c0e6-d3a0-4519-bbc1-7892d00cc325'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('10f0c0e6-d3a0-4519-bbc1-7892d00cc325', '4ECBC565-5795-460A-AE61-083BD7799765', 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', 'PipelineID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Training Pipelines -> MJ: ML Models (One To Many via PipelineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '23b6d2ca-e3bd-46ed-b82f-b150051d5fea'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('23b6d2ca-e3bd-46ed-b82f-b150051d5fea', '4ECBC565-5795-460A-AE61-083BD7799765', '109EDF71-1995-4A46-8EC8-09C2C2FF5310', 'PipelineID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Training Runs (One To Many via ResultingModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '22b41b60-7439-41b7-b8a0-c8d5b780e609'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('22b41b60-7439-41b7-b8a0-c8d5b780e609', '109EDF71-1995-4A46-8EC8-09C2C2FF5310', 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', 'ResultingModelID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Models -> MJ: ML Model Scoring Bindings (One To Many via MLModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '515e367f-3a3c-4394-a4aa-7519ae12c433'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('515e367f-3a3c-4394-a4aa-7519ae12c433', '109EDF71-1995-4A46-8EC8-09C2C2FF5310', 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', 'MLModelID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: Experiment Session Iterations (One To Many via AIAgentRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '784f5d7f-38d1-483d-bc57-4ac5b67bb322'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('784f5d7f-38d1-483d-bc57-4ac5b67bb322', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', 'AIAgentRunID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: Experiment Sessions (One To Many via AgentRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fe373732-04a0-42eb-8e70-cf0169e2db5d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fe373732-04a0-42eb-8e70-cf0169e2db5d', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '7FD949B2-B950-464E-B702-B93D48709C0D', 'AgentRunID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Algorithm Use Cases -> MJ: ML Algorithm Use Case Rankings (One To Many via MLAlgorithmUseCaseID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '26e53f8f-35d8-4b27-8270-554773b30d7a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('26e53f8f-35d8-4b27-8270-554773b30d7a', 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C', 'A3D384C6-AF3E-499A-9522-86FC1E58F15C', 'MLAlgorithmUseCaseID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Experiment Session Iterations -> MJ: ML Training Runs (One To Many via ExperimentSessionIterationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '73788545-2732-4b26-8189-0b03f481cce4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('73788545-2732-4b26-8189-0b03f481cce4', 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', 'ExperimentSessionIterationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: ML Training Pipelines (One To Many via TargetEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '19697e8f-6c57-452a-ac00-26742f3bf0c9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('19697e8f-6c57-452a-ac00-26742f3bf0c9', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '4ECBC565-5795-460A-AE61-083BD7799765', 'TargetEntityID', 'One To Many', 1, 1, 67, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: ML Model Scoring Bindings (One To Many via TargetEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2b825a30-c9f9-4ed5-a06c-94e3f4b284ab'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2b825a30-c9f9-4ed5-a06c-94e3f4b284ab', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', 'TargetEntityID', 'One To Many', 1, 1, 68, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Files -> MJ: ML Models (One To Many via ArtifactFileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a3c6ef8d-51c8-47ac-a343-9690466c2330'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a3c6ef8d-51c8-47ac-a343-9690466c2330', '29248F34-2837-EF11-86D4-6045BDEE16E6', '109EDF71-1995-4A46-8EC8-09C2C2FF5310', 'ArtifactFileID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Experiments -> MJ: Experiment Sessions (One To Many via ExperimentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '418fd6ef-9e6c-4356-9247-7dfd0c25a410'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('418fd6ef-9e6c-4356-9247-7dfd0c25a410', 'B134A583-9297-4399-9234-7B1B223DB2C7', '7FD949B2-B950-464E-B702-B93D48709C0D', 'ExperimentID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Experiment Sessions -> MJ: Experiment Session Iterations (One To Many via ExperimentSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd701cb80-67e4-46bf-a8c1-3965d4f7f222'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d701cb80-67e4-46bf-a8c1-3965d4f7f222', '7FD949B2-B950-464E-B702-B93D48709C0D', 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', 'ExperimentSessionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Record Processes -> MJ: ML Model Scoring Bindings (One To Many via RecordProcessID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9c0df3e3-da8a-48e7-83d1-12db109bb3cf'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9c0df3e3-da8a-48e7-83d1-12db109bb3cf', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', 'RecordProcessID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ExperimentSessionIteration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Session Iterations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ExperimentSessionID in table ExperimentSessionIteration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExperimentSessionIteration_ExperimentSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExperimentSessionIteration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExperimentSessionIteration_ExperimentSessionID ON [${flyway:defaultSchema}].[ExperimentSessionIteration] ([ExperimentSessionID]);

-- Index for foreign key AIAgentRunID in table ExperimentSessionIteration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExperimentSessionIteration_AIAgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExperimentSessionIteration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExperimentSessionIteration_AIAgentRunID ON [${flyway:defaultSchema}].[ExperimentSessionIteration] ([AIAgentRunID]);

/* SQL text to update entity field related entity name field map for entity field ID 4EA3399E-FB75-4F0A-9A94-FE280362D597 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4EA3399E-FB75-4F0A-9A94-FE280362D597', @RelatedEntityNameFieldMap='ExperimentSession';

/* Index for Foreign Keys for ExperimentSession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Sessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ExperimentID in table ExperimentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExperimentSession_ExperimentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExperimentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExperimentSession_ExperimentID ON [${flyway:defaultSchema}].[ExperimentSession] ([ExperimentID]);

-- Index for foreign key AgentRunID in table ExperimentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExperimentSession_AgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExperimentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExperimentSession_AgentRunID ON [${flyway:defaultSchema}].[ExperimentSession] ([AgentRunID]);

/* SQL text to update entity field related entity name field map for entity field ID D97E499F-298B-49D7-BA26-B54CB38F84BC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D97E499F-298B-49D7-BA26-B54CB38F84BC', @RelatedEntityNameFieldMap='Experiment';

/* SQL text to update entity field related entity name field map for entity field ID 7D2F1787-9140-44E4-A6A6-F7BC7CF3F6EA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7D2F1787-9140-44E4-A6A6-F7BC7CF3F6EA', @RelatedEntityNameFieldMap='AgentRun';

/* SQL text to update entity field related entity name field map for entity field ID 93AA895A-7B21-4D34-AD2A-3B873F792903 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='93AA895A-7B21-4D34-AD2A-3B873F792903', @RelatedEntityNameFieldMap='AIAgentRun';

/* Base View SQL for MJ: Experiment Session Iterations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Session Iterations
-- Item: vwExperimentSessionIterations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Experiment Session Iterations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ExperimentSessionIteration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwExperimentSessionIterations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwExperimentSessionIterations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwExperimentSessionIterations]
AS
SELECT
    e.*,
    MJExperimentSession_ExperimentSessionID.[Name] AS [ExperimentSession],
    MJAIAgentRun_AIAgentRunID.[RunName] AS [AIAgentRun]
FROM
    [${flyway:defaultSchema}].[ExperimentSessionIteration] AS e
INNER JOIN
    [${flyway:defaultSchema}].[ExperimentSession] AS MJExperimentSession_ExperimentSessionID
  ON
    [e].[ExperimentSessionID] = MJExperimentSession_ExperimentSessionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AIAgentRunID
  ON
    [e].[AIAgentRunID] = MJAIAgentRun_AIAgentRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwExperimentSessionIterations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Experiment Session Iterations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Session Iterations
-- Item: Permissions for vwExperimentSessionIterations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwExperimentSessionIterations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Experiment Session Iterations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Session Iterations
-- Item: spCreateExperimentSessionIteration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ExperimentSessionIteration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateExperimentSessionIteration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateExperimentSessionIteration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateExperimentSessionIteration]
    @ID uniqueidentifier = NULL,
    @ExperimentSessionID uniqueidentifier,
    @Sequence int = NULL,
    @Label_Clear bit = 0,
    @Label nvarchar(255) = NULL,
    @Status nvarchar(20) = NULL,
    @Score_Clear bit = 0,
    @Score decimal(18, 6) = NULL,
    @ComputeCost_Clear bit = 0,
    @ComputeCost decimal(18, 6) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @Rationale_Clear bit = 0,
    @Rationale nvarchar(MAX) = NULL,
    @AIAgentRunID_Clear bit = 0,
    @AIAgentRunID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ExperimentSessionIteration]
            (
                [ID],
                [ExperimentSessionID],
                [Sequence],
                [Label],
                [Status],
                [Score],
                [ComputeCost],
                [TokensUsed],
                [Rationale],
                [AIAgentRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ExperimentSessionID,
                ISNULL(@Sequence, 0),
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, NULL) END,
                CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @Rationale_Clear = 1 THEN NULL ELSE ISNULL(@Rationale, NULL) END,
                CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ExperimentSessionIteration]
            (
                [ExperimentSessionID],
                [Sequence],
                [Label],
                [Status],
                [Score],
                [ComputeCost],
                [TokensUsed],
                [Rationale],
                [AIAgentRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ExperimentSessionID,
                ISNULL(@Sequence, 0),
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, NULL) END,
                CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @Rationale_Clear = 1 THEN NULL ELSE ISNULL(@Rationale, NULL) END,
                CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwExperimentSessionIterations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExperimentSessionIteration] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Experiment Session Iterations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExperimentSessionIteration] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Experiment Session Iterations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Session Iterations
-- Item: spUpdateExperimentSessionIteration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExperimentSessionIteration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExperimentSessionIteration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExperimentSessionIteration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExperimentSessionIteration]
    @ID uniqueidentifier,
    @ExperimentSessionID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @Label_Clear bit = 0,
    @Label nvarchar(255) = NULL,
    @Status nvarchar(20) = NULL,
    @Score_Clear bit = 0,
    @Score decimal(18, 6) = NULL,
    @ComputeCost_Clear bit = 0,
    @ComputeCost decimal(18, 6) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @Rationale_Clear bit = 0,
    @Rationale nvarchar(MAX) = NULL,
    @AIAgentRunID_Clear bit = 0,
    @AIAgentRunID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExperimentSessionIteration]
    SET
        [ExperimentSessionID] = ISNULL(@ExperimentSessionID, [ExperimentSessionID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Label] = CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, [Label]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Score] = CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, [Score]) END,
        [ComputeCost] = CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, [ComputeCost]) END,
        [TokensUsed] = CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, [TokensUsed]) END,
        [Rationale] = CASE WHEN @Rationale_Clear = 1 THEN NULL ELSE ISNULL(@Rationale, [Rationale]) END,
        [AIAgentRunID] = CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, [AIAgentRunID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExperimentSessionIterations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExperimentSessionIterations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExperimentSessionIteration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExperimentSessionIteration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExperimentSessionIteration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExperimentSessionIteration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExperimentSessionIteration
ON [${flyway:defaultSchema}].[ExperimentSessionIteration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExperimentSessionIteration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ExperimentSessionIteration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Experiment Session Iterations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExperimentSessionIteration] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Experiment Session Iterations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Session Iterations
-- Item: spDeleteExperimentSessionIteration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ExperimentSessionIteration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteExperimentSessionIteration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteExperimentSessionIteration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteExperimentSessionIteration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ExperimentSessionIteration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExperimentSessionIteration] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Experiment Session Iterations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExperimentSessionIteration] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Experiment Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Sessions
-- Item: vwExperimentSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Experiment Sessions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ExperimentSession
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwExperimentSessions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwExperimentSessions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwExperimentSessions]
AS
SELECT
    e.*,
    MJExperiment_ExperimentID.[Name] AS [Experiment],
    MJAIAgentRun_AgentRunID.[RunName] AS [AgentRun]
FROM
    [${flyway:defaultSchema}].[ExperimentSession] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Experiment] AS MJExperiment_ExperimentID
  ON
    [e].[ExperimentID] = MJExperiment_ExperimentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AgentRunID
  ON
    [e].[AgentRunID] = MJAIAgentRun_AgentRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwExperimentSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Experiment Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Sessions
-- Item: Permissions for vwExperimentSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwExperimentSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Experiment Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Sessions
-- Item: spCreateExperimentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ExperimentSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateExperimentSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateExperimentSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateExperimentSession]
    @ID uniqueidentifier = NULL,
    @ExperimentID uniqueidentifier,
    @Name nvarchar(255),
    @Goal_Clear bit = 0,
    @Goal nvarchar(MAX) = NULL,
    @Budget_Clear bit = 0,
    @Budget nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @PlanSpec_Clear bit = 0,
    @PlanSpec nvarchar(MAX) = NULL,
    @Leaderboard_Clear bit = 0,
    @Leaderboard nvarchar(MAX) = NULL,
    @AgentRunID_Clear bit = 0,
    @AgentRunID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ExperimentSession]
            (
                [ID],
                [ExperimentID],
                [Name],
                [Goal],
                [Budget],
                [Status],
                [PlanSpec],
                [Leaderboard],
                [AgentRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ExperimentID,
                @Name,
                CASE WHEN @Goal_Clear = 1 THEN NULL ELSE ISNULL(@Goal, NULL) END,
                CASE WHEN @Budget_Clear = 1 THEN NULL ELSE ISNULL(@Budget, NULL) END,
                ISNULL(@Status, 'Planning'),
                CASE WHEN @PlanSpec_Clear = 1 THEN NULL ELSE ISNULL(@PlanSpec, NULL) END,
                CASE WHEN @Leaderboard_Clear = 1 THEN NULL ELSE ISNULL(@Leaderboard, NULL) END,
                CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ExperimentSession]
            (
                [ExperimentID],
                [Name],
                [Goal],
                [Budget],
                [Status],
                [PlanSpec],
                [Leaderboard],
                [AgentRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ExperimentID,
                @Name,
                CASE WHEN @Goal_Clear = 1 THEN NULL ELSE ISNULL(@Goal, NULL) END,
                CASE WHEN @Budget_Clear = 1 THEN NULL ELSE ISNULL(@Budget, NULL) END,
                ISNULL(@Status, 'Planning'),
                CASE WHEN @PlanSpec_Clear = 1 THEN NULL ELSE ISNULL(@PlanSpec, NULL) END,
                CASE WHEN @Leaderboard_Clear = 1 THEN NULL ELSE ISNULL(@Leaderboard, NULL) END,
                CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwExperimentSessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExperimentSession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Experiment Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExperimentSession] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Experiment Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Sessions
-- Item: spUpdateExperimentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExperimentSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExperimentSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExperimentSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExperimentSession]
    @ID uniqueidentifier,
    @ExperimentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Goal_Clear bit = 0,
    @Goal nvarchar(MAX) = NULL,
    @Budget_Clear bit = 0,
    @Budget nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @PlanSpec_Clear bit = 0,
    @PlanSpec nvarchar(MAX) = NULL,
    @Leaderboard_Clear bit = 0,
    @Leaderboard nvarchar(MAX) = NULL,
    @AgentRunID_Clear bit = 0,
    @AgentRunID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExperimentSession]
    SET
        [ExperimentID] = ISNULL(@ExperimentID, [ExperimentID]),
        [Name] = ISNULL(@Name, [Name]),
        [Goal] = CASE WHEN @Goal_Clear = 1 THEN NULL ELSE ISNULL(@Goal, [Goal]) END,
        [Budget] = CASE WHEN @Budget_Clear = 1 THEN NULL ELSE ISNULL(@Budget, [Budget]) END,
        [Status] = ISNULL(@Status, [Status]),
        [PlanSpec] = CASE WHEN @PlanSpec_Clear = 1 THEN NULL ELSE ISNULL(@PlanSpec, [PlanSpec]) END,
        [Leaderboard] = CASE WHEN @Leaderboard_Clear = 1 THEN NULL ELSE ISNULL(@Leaderboard, [Leaderboard]) END,
        [AgentRunID] = CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, [AgentRunID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExperimentSessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExperimentSessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExperimentSession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExperimentSession table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExperimentSession]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExperimentSession];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExperimentSession
ON [${flyway:defaultSchema}].[ExperimentSession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExperimentSession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ExperimentSession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Experiment Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExperimentSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Experiment Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiment Sessions
-- Item: spDeleteExperimentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ExperimentSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteExperimentSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteExperimentSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteExperimentSession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ExperimentSession]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExperimentSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Experiment Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExperimentSession] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Experiment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Experiments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiments
-- Item: vwExperiments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Experiments
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Experiment
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwExperiments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwExperiments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwExperiments]
AS
SELECT
    e.*
FROM
    [${flyway:defaultSchema}].[Experiment] AS e
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwExperiments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Experiments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiments
-- Item: Permissions for vwExperiments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwExperiments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Experiments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiments
-- Item: spCreateExperiment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Experiment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateExperiment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateExperiment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateExperiment]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ExperimentType nvarchar(50),
    @Goal_Clear bit = 0,
    @Goal nvarchar(MAX) = NULL,
    @TargetMetric_Clear bit = 0,
    @TargetMetric nvarchar(100) = NULL,
    @PlanSpecTemplate_Clear bit = 0,
    @PlanSpecTemplate nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Experiment]
            (
                [ID],
                [Name],
                [Description],
                [ExperimentType],
                [Goal],
                [TargetMetric],
                [PlanSpecTemplate],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ExperimentType,
                CASE WHEN @Goal_Clear = 1 THEN NULL ELSE ISNULL(@Goal, NULL) END,
                CASE WHEN @TargetMetric_Clear = 1 THEN NULL ELSE ISNULL(@TargetMetric, NULL) END,
                CASE WHEN @PlanSpecTemplate_Clear = 1 THEN NULL ELSE ISNULL(@PlanSpecTemplate, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Experiment]
            (
                [Name],
                [Description],
                [ExperimentType],
                [Goal],
                [TargetMetric],
                [PlanSpecTemplate],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ExperimentType,
                CASE WHEN @Goal_Clear = 1 THEN NULL ELSE ISNULL(@Goal, NULL) END,
                CASE WHEN @TargetMetric_Clear = 1 THEN NULL ELSE ISNULL(@TargetMetric, NULL) END,
                CASE WHEN @PlanSpecTemplate_Clear = 1 THEN NULL ELSE ISNULL(@PlanSpecTemplate, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwExperiments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExperiment] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Experiments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExperiment] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Experiments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiments
-- Item: spUpdateExperiment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Experiment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExperiment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExperiment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExperiment]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ExperimentType nvarchar(50) = NULL,
    @Goal_Clear bit = 0,
    @Goal nvarchar(MAX) = NULL,
    @TargetMetric_Clear bit = 0,
    @TargetMetric nvarchar(100) = NULL,
    @PlanSpecTemplate_Clear bit = 0,
    @PlanSpecTemplate nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Experiment]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ExperimentType] = ISNULL(@ExperimentType, [ExperimentType]),
        [Goal] = CASE WHEN @Goal_Clear = 1 THEN NULL ELSE ISNULL(@Goal, [Goal]) END,
        [TargetMetric] = CASE WHEN @TargetMetric_Clear = 1 THEN NULL ELSE ISNULL(@TargetMetric, [TargetMetric]) END,
        [PlanSpecTemplate] = CASE WHEN @PlanSpecTemplate_Clear = 1 THEN NULL ELSE ISNULL(@PlanSpecTemplate, [PlanSpecTemplate]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExperiments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExperiments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExperiment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Experiment table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExperiment]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExperiment];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExperiment
ON [${flyway:defaultSchema}].[Experiment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Experiment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Experiment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Experiments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExperiment] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Experiments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Experiments
-- Item: spDeleteExperiment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Experiment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteExperiment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteExperiment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteExperiment]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Experiment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExperiment] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Experiments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExperiment] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLAlgorithmUseCaseRanking */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Case Rankings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MLAlgorithmID in table MLAlgorithmUseCaseRanking
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLAlgorithmUseCaseRanking_MLAlgorithmID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLAlgorithmUseCaseRanking_MLAlgorithmID ON [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] ([MLAlgorithmID]);

-- Index for foreign key MLAlgorithmUseCaseID in table MLAlgorithmUseCaseRanking
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLAlgorithmUseCaseRanking_MLAlgorithmUseCaseID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLAlgorithmUseCaseRanking_MLAlgorithmUseCaseID ON [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] ([MLAlgorithmUseCaseID]);

/* SQL text to update entity field related entity name field map for entity field ID 8241724E-4838-4E2C-AD11-20379437F277 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8241724E-4838-4E2C-AD11-20379437F277', @RelatedEntityNameFieldMap='MLAlgorithm';

/* Index for Foreign Keys for MLAlgorithmUseCase */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Cases
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for MLAlgorithm */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithms
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: ML Algorithm Use Cases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Cases
-- Item: vwMLAlgorithmUseCases
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Algorithm Use Cases
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLAlgorithmUseCase
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLAlgorithmUseCases]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLAlgorithmUseCases];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLAlgorithmUseCases]
AS
SELECT
    m.*
FROM
    [${flyway:defaultSchema}].[MLAlgorithmUseCase] AS m
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLAlgorithmUseCases] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Algorithm Use Cases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Cases
-- Item: Permissions for vwMLAlgorithmUseCases
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLAlgorithmUseCases] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Algorithm Use Cases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Cases
-- Item: spCreateMLAlgorithmUseCase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLAlgorithmUseCase
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLAlgorithmUseCase]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLAlgorithmUseCase];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLAlgorithmUseCase]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ProblemTypeScope nvarchar(20) = NULL,
    @Guidance_Clear bit = 0,
    @Guidance nvarchar(MAX) = NULL,
    @DisplayOrder int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLAlgorithmUseCase]
            (
                [ID],
                [Name],
                [Description],
                [ProblemTypeScope],
                [Guidance],
                [DisplayOrder]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@ProblemTypeScope, 'any'),
                CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, NULL) END,
                ISNULL(@DisplayOrder, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLAlgorithmUseCase]
            (
                [Name],
                [Description],
                [ProblemTypeScope],
                [Guidance],
                [DisplayOrder]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@ProblemTypeScope, 'any'),
                CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, NULL) END,
                ISNULL(@DisplayOrder, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLAlgorithmUseCases] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLAlgorithmUseCase] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Algorithm Use Cases */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLAlgorithmUseCase] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Algorithm Use Cases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Cases
-- Item: spUpdateMLAlgorithmUseCase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLAlgorithmUseCase
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLAlgorithmUseCase]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLAlgorithmUseCase];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLAlgorithmUseCase]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ProblemTypeScope nvarchar(20) = NULL,
    @Guidance_Clear bit = 0,
    @Guidance nvarchar(MAX) = NULL,
    @DisplayOrder int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLAlgorithmUseCase]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ProblemTypeScope] = ISNULL(@ProblemTypeScope, [ProblemTypeScope]),
        [Guidance] = CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, [Guidance]) END,
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLAlgorithmUseCases] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLAlgorithmUseCases]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLAlgorithmUseCase] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLAlgorithmUseCase table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLAlgorithmUseCase]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLAlgorithmUseCase];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLAlgorithmUseCase
ON [${flyway:defaultSchema}].[MLAlgorithmUseCase]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLAlgorithmUseCase]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLAlgorithmUseCase] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Algorithm Use Cases */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLAlgorithmUseCase] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: ML Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithms
-- Item: vwMLAlgorithms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Algorithms
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLAlgorithm
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLAlgorithms]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLAlgorithms];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLAlgorithms]
AS
SELECT
    m.*
FROM
    [${flyway:defaultSchema}].[MLAlgorithm] AS m
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLAlgorithms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithms
-- Item: Permissions for vwMLAlgorithms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLAlgorithms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithms
-- Item: spCreateMLAlgorithm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLAlgorithm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLAlgorithm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLAlgorithm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLAlgorithm]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ProblemTypes nvarchar(100),
    @DriverClass nvarchar(255),
    @HyperparameterSchema_Clear bit = 0,
    @HyperparameterSchema nvarchar(MAX) = NULL,
    @DefaultHyperparameters_Clear bit = 0,
    @DefaultHyperparameters nvarchar(MAX) = NULL,
    @SupportsFeatureImportance bit = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLAlgorithm]
            (
                [ID],
                [Name],
                [Description],
                [ProblemTypes],
                [DriverClass],
                [HyperparameterSchema],
                [DefaultHyperparameters],
                [SupportsFeatureImportance],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ProblemTypes,
                @DriverClass,
                CASE WHEN @HyperparameterSchema_Clear = 1 THEN NULL ELSE ISNULL(@HyperparameterSchema, NULL) END,
                CASE WHEN @DefaultHyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@DefaultHyperparameters, NULL) END,
                ISNULL(@SupportsFeatureImportance, 1),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLAlgorithm]
            (
                [Name],
                [Description],
                [ProblemTypes],
                [DriverClass],
                [HyperparameterSchema],
                [DefaultHyperparameters],
                [SupportsFeatureImportance],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ProblemTypes,
                @DriverClass,
                CASE WHEN @HyperparameterSchema_Clear = 1 THEN NULL ELSE ISNULL(@HyperparameterSchema, NULL) END,
                CASE WHEN @DefaultHyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@DefaultHyperparameters, NULL) END,
                ISNULL(@SupportsFeatureImportance, 1),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLAlgorithms] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLAlgorithm] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Algorithms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLAlgorithm] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithms
-- Item: spUpdateMLAlgorithm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLAlgorithm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLAlgorithm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLAlgorithm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLAlgorithm]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ProblemTypes nvarchar(100) = NULL,
    @DriverClass nvarchar(255) = NULL,
    @HyperparameterSchema_Clear bit = 0,
    @HyperparameterSchema nvarchar(MAX) = NULL,
    @DefaultHyperparameters_Clear bit = 0,
    @DefaultHyperparameters nvarchar(MAX) = NULL,
    @SupportsFeatureImportance bit = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLAlgorithm]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ProblemTypes] = ISNULL(@ProblemTypes, [ProblemTypes]),
        [DriverClass] = ISNULL(@DriverClass, [DriverClass]),
        [HyperparameterSchema] = CASE WHEN @HyperparameterSchema_Clear = 1 THEN NULL ELSE ISNULL(@HyperparameterSchema, [HyperparameterSchema]) END,
        [DefaultHyperparameters] = CASE WHEN @DefaultHyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@DefaultHyperparameters, [DefaultHyperparameters]) END,
        [SupportsFeatureImportance] = ISNULL(@SupportsFeatureImportance, [SupportsFeatureImportance]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLAlgorithms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLAlgorithms]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLAlgorithm] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLAlgorithm table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLAlgorithm]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLAlgorithm];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLAlgorithm
ON [${flyway:defaultSchema}].[MLAlgorithm]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLAlgorithm]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLAlgorithm] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Algorithms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLAlgorithm] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Algorithm Use Cases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Cases
-- Item: spDeleteMLAlgorithmUseCase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLAlgorithmUseCase
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLAlgorithmUseCase]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLAlgorithmUseCase];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLAlgorithmUseCase]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLAlgorithmUseCase]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLAlgorithmUseCase] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Algorithm Use Cases */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLAlgorithmUseCase] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithms
-- Item: spDeleteMLAlgorithm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLAlgorithm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLAlgorithm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLAlgorithm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLAlgorithm]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLAlgorithm]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLAlgorithm] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Algorithms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLAlgorithm] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 0130D794-BE82-4C28-AFB8-5446DAAE2236 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0130D794-BE82-4C28-AFB8-5446DAAE2236', @RelatedEntityNameFieldMap='MLAlgorithmUseCase';

/* Base View SQL for MJ: ML Algorithm Use Case Rankings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Case Rankings
-- Item: vwMLAlgorithmUseCaseRankings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Algorithm Use Case Rankings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLAlgorithmUseCaseRanking
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLAlgorithmUseCaseRankings]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLAlgorithmUseCaseRankings];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLAlgorithmUseCaseRankings]
AS
SELECT
    m.*,
    MJMLAlgorithm_MLAlgorithmID.[Name] AS [MLAlgorithm],
    MJMLAlgorithmUseCase_MLAlgorithmUseCaseID.[Name] AS [MLAlgorithmUseCase]
FROM
    [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_MLAlgorithmID
  ON
    [m].[MLAlgorithmID] = MJMLAlgorithm_MLAlgorithmID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLAlgorithmUseCase] AS MJMLAlgorithmUseCase_MLAlgorithmUseCaseID
  ON
    [m].[MLAlgorithmUseCaseID] = MJMLAlgorithmUseCase_MLAlgorithmUseCaseID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLAlgorithmUseCaseRankings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Algorithm Use Case Rankings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Case Rankings
-- Item: Permissions for vwMLAlgorithmUseCaseRankings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLAlgorithmUseCaseRankings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Algorithm Use Case Rankings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Case Rankings
-- Item: spCreateMLAlgorithmUseCaseRanking
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLAlgorithmUseCaseRanking
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLAlgorithmUseCaseRanking]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLAlgorithmUseCaseRanking];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLAlgorithmUseCaseRanking]
    @ID uniqueidentifier = NULL,
    @MLAlgorithmID uniqueidentifier,
    @MLAlgorithmUseCaseID uniqueidentifier,
    @SuitabilityScore int,
    @RecommendationLevel nvarchar(20),
    @Rationale_Clear bit = 0,
    @Rationale nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking]
            (
                [ID],
                [MLAlgorithmID],
                [MLAlgorithmUseCaseID],
                [SuitabilityScore],
                [RecommendationLevel],
                [Rationale]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MLAlgorithmID,
                @MLAlgorithmUseCaseID,
                @SuitabilityScore,
                @RecommendationLevel,
                CASE WHEN @Rationale_Clear = 1 THEN NULL ELSE ISNULL(@Rationale, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking]
            (
                [MLAlgorithmID],
                [MLAlgorithmUseCaseID],
                [SuitabilityScore],
                [RecommendationLevel],
                [Rationale]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MLAlgorithmID,
                @MLAlgorithmUseCaseID,
                @SuitabilityScore,
                @RecommendationLevel,
                CASE WHEN @Rationale_Clear = 1 THEN NULL ELSE ISNULL(@Rationale, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLAlgorithmUseCaseRankings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLAlgorithmUseCaseRanking] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Algorithm Use Case Rankings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLAlgorithmUseCaseRanking] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Algorithm Use Case Rankings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Case Rankings
-- Item: spUpdateMLAlgorithmUseCaseRanking
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLAlgorithmUseCaseRanking
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLAlgorithmUseCaseRanking]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLAlgorithmUseCaseRanking];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLAlgorithmUseCaseRanking]
    @ID uniqueidentifier,
    @MLAlgorithmID uniqueidentifier = NULL,
    @MLAlgorithmUseCaseID uniqueidentifier = NULL,
    @SuitabilityScore int = NULL,
    @RecommendationLevel nvarchar(20) = NULL,
    @Rationale_Clear bit = 0,
    @Rationale nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking]
    SET
        [MLAlgorithmID] = ISNULL(@MLAlgorithmID, [MLAlgorithmID]),
        [MLAlgorithmUseCaseID] = ISNULL(@MLAlgorithmUseCaseID, [MLAlgorithmUseCaseID]),
        [SuitabilityScore] = ISNULL(@SuitabilityScore, [SuitabilityScore]),
        [RecommendationLevel] = ISNULL(@RecommendationLevel, [RecommendationLevel]),
        [Rationale] = CASE WHEN @Rationale_Clear = 1 THEN NULL ELSE ISNULL(@Rationale, [Rationale]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLAlgorithmUseCaseRankings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLAlgorithmUseCaseRankings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLAlgorithmUseCaseRanking] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLAlgorithmUseCaseRanking table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLAlgorithmUseCaseRanking]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLAlgorithmUseCaseRanking];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLAlgorithmUseCaseRanking
ON [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Algorithm Use Case Rankings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLAlgorithmUseCaseRanking] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Algorithm Use Case Rankings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Algorithm Use Case Rankings
-- Item: spDeleteMLAlgorithmUseCaseRanking
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLAlgorithmUseCaseRanking
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLAlgorithmUseCaseRanking]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLAlgorithmUseCaseRanking];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLAlgorithmUseCaseRanking]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLAlgorithmUseCaseRanking]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLAlgorithmUseCaseRanking] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Algorithm Use Case Rankings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLAlgorithmUseCaseRanking] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLModelScoringBinding */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MLModelID in table MLModelScoringBinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelScoringBinding_MLModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelScoringBinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelScoringBinding_MLModelID ON [${flyway:defaultSchema}].[MLModelScoringBinding] ([MLModelID]);

-- Index for foreign key RecordProcessID in table MLModelScoringBinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelScoringBinding_RecordProcessID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelScoringBinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelScoringBinding_RecordProcessID ON [${flyway:defaultSchema}].[MLModelScoringBinding] ([RecordProcessID]);

-- Index for foreign key TargetEntityID in table MLModelScoringBinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelScoringBinding_TargetEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelScoringBinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelScoringBinding_TargetEntityID ON [${flyway:defaultSchema}].[MLModelScoringBinding] ([TargetEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 9ED5A18F-CEA7-4BAE-BCCE-678324C3E825 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9ED5A18F-CEA7-4BAE-BCCE-678324C3E825', @RelatedEntityNameFieldMap='RecordProcess';

/* Index for Foreign Keys for MLModel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PipelineID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_PipelineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_PipelineID ON [${flyway:defaultSchema}].[MLModel] ([PipelineID]);

-- Index for foreign key AlgorithmID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_AlgorithmID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_AlgorithmID ON [${flyway:defaultSchema}].[MLModel] ([AlgorithmID]);

-- Index for foreign key ArtifactFileID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_ArtifactFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_ArtifactFileID ON [${flyway:defaultSchema}].[MLModel] ([ArtifactFileID]);

/* SQL text to update entity field related entity name field map for entity field ID 644DFC9E-D19F-432F-9D43-21BBE0C660D8 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='644DFC9E-D19F-432F-9D43-21BBE0C660D8', @RelatedEntityNameFieldMap='Pipeline';

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

/* SQL text to update entity field related entity name field map for entity field ID F00C9D6A-ECA5-4DC6-95CF-2C3FB52D061B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F00C9D6A-ECA5-4DC6-95CF-2C3FB52D061B', @RelatedEntityNameFieldMap='TargetEntity';

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

/* SQL text to update entity field related entity name field map for entity field ID 5909321D-C26E-452B-B677-8643585DD22C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5909321D-C26E-452B-B677-8643585DD22C', @RelatedEntityNameFieldMap='Pipeline';

/* SQL text to update entity field related entity name field map for entity field ID 7FFD971A-D247-4872-9E50-9D3A771D3C63 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7FFD971A-D247-4872-9E50-9D3A771D3C63', @RelatedEntityNameFieldMap='Algorithm';

/* SQL text to update entity field related entity name field map for entity field ID F5CF7DF3-1023-4030-84F4-DCE22EDD62B0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F5CF7DF3-1023-4030-84F4-DCE22EDD62B0', @RelatedEntityNameFieldMap='Algorithm';

/* SQL text to update entity field related entity name field map for entity field ID 4778A54A-DB94-4134-9A46-FE57309B172A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4778A54A-DB94-4134-9A46-FE57309B172A', @RelatedEntityNameFieldMap='Algorithm';

/* SQL text to update entity field related entity name field map for entity field ID E1858CC5-BB1A-45FC-8420-1CAF542AFC37 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E1858CC5-BB1A-45FC-8420-1CAF542AFC37', @RelatedEntityNameFieldMap='TargetEntity';

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
    MJMLAlgorithm_AlgorithmID.[Name] AS [Algorithm]
FROM
    [${flyway:defaultSchema}].[MLTrainingRun] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_PipelineID
  ON
    [m].[PipelineID] = MJMLTrainingPipeline_PipelineID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
GO
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
    @Notes nvarchar(MAX) = NULL
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
                [Notes]
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
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
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
                [Notes]
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
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLTrainingRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Training Runs */

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
    @Notes nvarchar(MAX) = NULL
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
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Training Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID A63B59C5-0DB4-4887-A1A3-EA70AF57D80C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A63B59C5-0DB4-4887-A1A3-EA70AF57D80C', @RelatedEntityNameFieldMap='ArtifactFile';

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
    MJMLAlgorithm_AlgorithmID.[Name] AS [Algorithm]
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
GO
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
    @ValidationStrategy nvarchar(MAX) = NULL
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
                [ValidationStrategy]
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
                CASE WHEN @ValidationStrategy_Clear = 1 THEN NULL ELSE ISNULL(@ValidationStrategy, NULL) END
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
                [ValidationStrategy]
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
                CASE WHEN @ValidationStrategy_Clear = 1 THEN NULL ELSE ISNULL(@ValidationStrategy, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLTrainingPipelines] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Training Pipelines */

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
    @ValidationStrategy nvarchar(MAX) = NULL
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
        [ValidationStrategy] = CASE WHEN @ValidationStrategy_Clear = 1 THEN NULL ELSE ISNULL(@ValidationStrategy, [ValidationStrategy]) END
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Training Pipelines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: ML Model Scoring Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: vwMLModelScoringBindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Model Scoring Bindings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLModelScoringBinding
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLModelScoringBindings]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLModelScoringBindings];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLModelScoringBindings]
AS
SELECT
    m.*,
    MJRecordProcess_RecordProcessID.[Name] AS [RecordProcess],
    MJEntity_TargetEntityID.[Name] AS [TargetEntity]
FROM
    [${flyway:defaultSchema}].[MLModelScoringBinding] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RecordProcess] AS MJRecordProcess_RecordProcessID
  ON
    [m].[RecordProcessID] = MJRecordProcess_RecordProcessID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_TargetEntityID
  ON
    [m].[TargetEntityID] = MJEntity_TargetEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModelScoringBindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Model Scoring Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: Permissions for vwMLModelScoringBindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModelScoringBindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Model Scoring Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: spCreateMLModelScoringBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLModelScoringBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLModelScoringBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLModelScoringBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLModelScoringBinding]
    @ID uniqueidentifier = NULL,
    @MLModelID uniqueidentifier,
    @RecordProcessID_Clear bit = 0,
    @RecordProcessID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetColumn_Clear bit = 0,
    @TargetColumn nvarchar(255) = NULL,
    @Mode nvarchar(20) = NULL,
    @MaterializedResultID_Clear bit = 0,
    @MaterializedResultID uniqueidentifier = NULL,
    @LastScoredAt_Clear bit = 0,
    @LastScoredAt datetimeoffset = NULL,
    @LastRowCount_Clear bit = 0,
    @LastRowCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLModelScoringBinding]
            (
                [ID],
                [MLModelID],
                [RecordProcessID],
                [TargetEntityID],
                [TargetColumn],
                [Mode],
                [MaterializedResultID],
                [LastScoredAt],
                [LastRowCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MLModelID,
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetColumn_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumn, NULL) END,
                ISNULL(@Mode, 'OnDemand'),
                CASE WHEN @MaterializedResultID_Clear = 1 THEN NULL ELSE ISNULL(@MaterializedResultID, NULL) END,
                CASE WHEN @LastScoredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastScoredAt, NULL) END,
                CASE WHEN @LastRowCount_Clear = 1 THEN NULL ELSE ISNULL(@LastRowCount, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLModelScoringBinding]
            (
                [MLModelID],
                [RecordProcessID],
                [TargetEntityID],
                [TargetColumn],
                [Mode],
                [MaterializedResultID],
                [LastScoredAt],
                [LastRowCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MLModelID,
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetColumn_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumn, NULL) END,
                ISNULL(@Mode, 'OnDemand'),
                CASE WHEN @MaterializedResultID_Clear = 1 THEN NULL ELSE ISNULL(@MaterializedResultID, NULL) END,
                CASE WHEN @LastScoredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastScoredAt, NULL) END,
                CASE WHEN @LastRowCount_Clear = 1 THEN NULL ELSE ISNULL(@LastRowCount, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLModelScoringBindings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Model Scoring Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Model Scoring Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: spUpdateMLModelScoringBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLModelScoringBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLModelScoringBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding]
    @ID uniqueidentifier,
    @MLModelID uniqueidentifier = NULL,
    @RecordProcessID_Clear bit = 0,
    @RecordProcessID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetColumn_Clear bit = 0,
    @TargetColumn nvarchar(255) = NULL,
    @Mode nvarchar(20) = NULL,
    @MaterializedResultID_Clear bit = 0,
    @MaterializedResultID uniqueidentifier = NULL,
    @LastScoredAt_Clear bit = 0,
    @LastScoredAt datetimeoffset = NULL,
    @LastRowCount_Clear bit = 0,
    @LastRowCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLModelScoringBinding]
    SET
        [MLModelID] = ISNULL(@MLModelID, [MLModelID]),
        [RecordProcessID] = CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, [RecordProcessID]) END,
        [TargetEntityID] = CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, [TargetEntityID]) END,
        [TargetColumn] = CASE WHEN @TargetColumn_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumn, [TargetColumn]) END,
        [Mode] = ISNULL(@Mode, [Mode]),
        [MaterializedResultID] = CASE WHEN @MaterializedResultID_Clear = 1 THEN NULL ELSE ISNULL(@MaterializedResultID, [MaterializedResultID]) END,
        [LastScoredAt] = CASE WHEN @LastScoredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastScoredAt, [LastScoredAt]) END,
        [LastRowCount] = CASE WHEN @LastRowCount_Clear = 1 THEN NULL ELSE ISNULL(@LastRowCount, [LastRowCount]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLModelScoringBindings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLModelScoringBindings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLModelScoringBinding table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLModelScoringBinding]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLModelScoringBinding];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLModelScoringBinding
ON [${flyway:defaultSchema}].[MLModelScoringBinding]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLModelScoringBinding]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLModelScoringBinding] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Model Scoring Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Model Scoring Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: spDeleteMLModelScoringBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLModelScoringBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLModelScoringBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLModelScoringBinding]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Model Scoring Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: vwMLModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Models
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLModels]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLModels];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLModels]
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID.[Name] AS [Pipeline],
    MJMLAlgorithm_AlgorithmID.[Name] AS [Algorithm],
    MJFile_ArtifactFileID.[Name] AS [ArtifactFile]
FROM
    [${flyway:defaultSchema}].[MLModel] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_PipelineID
  ON
    [m].[PipelineID] = MJMLTrainingPipeline_PipelineID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_ArtifactFileID
  ON
    [m].[ArtifactFileID] = MJFile_ArtifactFileID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: Permissions for vwMLModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: spCreateMLModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLModel]
    @ID uniqueidentifier = NULL,
    @PipelineID uniqueidentifier,
    @Version int = NULL,
    @AlgorithmID uniqueidentifier,
    @ArtifactFileID_Clear bit = 0,
    @ArtifactFileID uniqueidentifier = NULL,
    @FittedPreprocessing_Clear bit = 0,
    @FittedPreprocessing nvarchar(MAX) = NULL,
    @FeatureSchema nvarchar(MAX),
    @TargetVariable nvarchar(500),
    @ProblemType nvarchar(20),
    @Metrics_Clear bit = 0,
    @Metrics nvarchar(MAX) = NULL,
    @HoldoutMetrics_Clear bit = 0,
    @HoldoutMetrics nvarchar(MAX) = NULL,
    @FeatureImportance_Clear bit = 0,
    @FeatureImportance nvarchar(MAX) = NULL,
    @Lineage_Clear bit = 0,
    @Lineage nvarchar(MAX) = NULL,
    @TrainedAt_Clear bit = 0,
    @TrainedAt datetimeoffset = NULL,
    @TrainingDurationSec_Clear bit = 0,
    @TrainingDurationSec int = NULL,
    @TrainingRowCount_Clear bit = 0,
    @TrainingRowCount int = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLModel]
            (
                [ID],
                [PipelineID],
                [Version],
                [AlgorithmID],
                [ArtifactFileID],
                [FittedPreprocessing],
                [FeatureSchema],
                [TargetVariable],
                [ProblemType],
                [Metrics],
                [HoldoutMetrics],
                [FeatureImportance],
                [Lineage],
                [TrainedAt],
                [TrainingDurationSec],
                [TrainingRowCount],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PipelineID,
                ISNULL(@Version, 1),
                @AlgorithmID,
                CASE WHEN @ArtifactFileID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactFileID, NULL) END,
                CASE WHEN @FittedPreprocessing_Clear = 1 THEN NULL ELSE ISNULL(@FittedPreprocessing, NULL) END,
                @FeatureSchema,
                @TargetVariable,
                @ProblemType,
                CASE WHEN @Metrics_Clear = 1 THEN NULL ELSE ISNULL(@Metrics, NULL) END,
                CASE WHEN @HoldoutMetrics_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetrics, NULL) END,
                CASE WHEN @FeatureImportance_Clear = 1 THEN NULL ELSE ISNULL(@FeatureImportance, NULL) END,
                CASE WHEN @Lineage_Clear = 1 THEN NULL ELSE ISNULL(@Lineage, NULL) END,
                CASE WHEN @TrainedAt_Clear = 1 THEN NULL ELSE ISNULL(@TrainedAt, NULL) END,
                CASE WHEN @TrainingDurationSec_Clear = 1 THEN NULL ELSE ISNULL(@TrainingDurationSec, NULL) END,
                CASE WHEN @TrainingRowCount_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRowCount, NULL) END,
                ISNULL(@Status, 'Draft')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLModel]
            (
                [PipelineID],
                [Version],
                [AlgorithmID],
                [ArtifactFileID],
                [FittedPreprocessing],
                [FeatureSchema],
                [TargetVariable],
                [ProblemType],
                [Metrics],
                [HoldoutMetrics],
                [FeatureImportance],
                [Lineage],
                [TrainedAt],
                [TrainingDurationSec],
                [TrainingRowCount],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PipelineID,
                ISNULL(@Version, 1),
                @AlgorithmID,
                CASE WHEN @ArtifactFileID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactFileID, NULL) END,
                CASE WHEN @FittedPreprocessing_Clear = 1 THEN NULL ELSE ISNULL(@FittedPreprocessing, NULL) END,
                @FeatureSchema,
                @TargetVariable,
                @ProblemType,
                CASE WHEN @Metrics_Clear = 1 THEN NULL ELSE ISNULL(@Metrics, NULL) END,
                CASE WHEN @HoldoutMetrics_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetrics, NULL) END,
                CASE WHEN @FeatureImportance_Clear = 1 THEN NULL ELSE ISNULL(@FeatureImportance, NULL) END,
                CASE WHEN @Lineage_Clear = 1 THEN NULL ELSE ISNULL(@Lineage, NULL) END,
                CASE WHEN @TrainedAt_Clear = 1 THEN NULL ELSE ISNULL(@TrainedAt, NULL) END,
                CASE WHEN @TrainingDurationSec_Clear = 1 THEN NULL ELSE ISNULL(@TrainingDurationSec, NULL) END,
                CASE WHEN @TrainingRowCount_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRowCount, NULL) END,
                ISNULL(@Status, 'Draft')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModel] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModel] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: spUpdateMLModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModel]
    @ID uniqueidentifier,
    @PipelineID uniqueidentifier = NULL,
    @Version int = NULL,
    @AlgorithmID uniqueidentifier = NULL,
    @ArtifactFileID_Clear bit = 0,
    @ArtifactFileID uniqueidentifier = NULL,
    @FittedPreprocessing_Clear bit = 0,
    @FittedPreprocessing nvarchar(MAX) = NULL,
    @FeatureSchema nvarchar(MAX) = NULL,
    @TargetVariable nvarchar(500) = NULL,
    @ProblemType nvarchar(20) = NULL,
    @Metrics_Clear bit = 0,
    @Metrics nvarchar(MAX) = NULL,
    @HoldoutMetrics_Clear bit = 0,
    @HoldoutMetrics nvarchar(MAX) = NULL,
    @FeatureImportance_Clear bit = 0,
    @FeatureImportance nvarchar(MAX) = NULL,
    @Lineage_Clear bit = 0,
    @Lineage nvarchar(MAX) = NULL,
    @TrainedAt_Clear bit = 0,
    @TrainedAt datetimeoffset = NULL,
    @TrainingDurationSec_Clear bit = 0,
    @TrainingDurationSec int = NULL,
    @TrainingRowCount_Clear bit = 0,
    @TrainingRowCount int = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLModel]
    SET
        [PipelineID] = ISNULL(@PipelineID, [PipelineID]),
        [Version] = ISNULL(@Version, [Version]),
        [AlgorithmID] = ISNULL(@AlgorithmID, [AlgorithmID]),
        [ArtifactFileID] = CASE WHEN @ArtifactFileID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactFileID, [ArtifactFileID]) END,
        [FittedPreprocessing] = CASE WHEN @FittedPreprocessing_Clear = 1 THEN NULL ELSE ISNULL(@FittedPreprocessing, [FittedPreprocessing]) END,
        [FeatureSchema] = ISNULL(@FeatureSchema, [FeatureSchema]),
        [TargetVariable] = ISNULL(@TargetVariable, [TargetVariable]),
        [ProblemType] = ISNULL(@ProblemType, [ProblemType]),
        [Metrics] = CASE WHEN @Metrics_Clear = 1 THEN NULL ELSE ISNULL(@Metrics, [Metrics]) END,
        [HoldoutMetrics] = CASE WHEN @HoldoutMetrics_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetrics, [HoldoutMetrics]) END,
        [FeatureImportance] = CASE WHEN @FeatureImportance_Clear = 1 THEN NULL ELSE ISNULL(@FeatureImportance, [FeatureImportance]) END,
        [Lineage] = CASE WHEN @Lineage_Clear = 1 THEN NULL ELSE ISNULL(@Lineage, [Lineage]) END,
        [TrainedAt] = CASE WHEN @TrainedAt_Clear = 1 THEN NULL ELSE ISNULL(@TrainedAt, [TrainedAt]) END,
        [TrainingDurationSec] = CASE WHEN @TrainingDurationSec_Clear = 1 THEN NULL ELSE ISNULL(@TrainingDurationSec, [TrainingDurationSec]) END,
        [TrainingRowCount] = CASE WHEN @TrainingRowCount_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRowCount, [TrainingRowCount]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLModels] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLModels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLModel table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLModel]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLModel];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLModel
ON [${flyway:defaultSchema}].[MLModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLModel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLModel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModel] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: spDeleteMLModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLModel]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModel] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModel] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceAIAgentRunIDID, @AgentID = @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @UserID = @MJAIAgentExamples_SourceAIAgentRunID_UserID, @CompanyID = @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @Type = @MJAIAgentExamples_SourceAIAgentRunID_Type, @ExampleInput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @Comments = @MJAIAgentExamples_SourceAIAgentRunID_Comments, @Status = @MJAIAgentExamples_SourceAIAgentRunID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AuthorType nvarchar(20)
    DECLARE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @MJAIAgentNotes_SourceAIAgentRunID_AuthorType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceAIAgentRunIDID, @AgentID = @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceAIAgentRunID_Note, @UserID = @MJAIAgentNotes_SourceAIAgentRunID_UserID, @Type = @MJAIAgentNotes_SourceAIAgentRunID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceAIAgentRunID_Comments, @Status = @MJAIAgentNotes_SourceAIAgentRunID_Status, @SourceConversationID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @AuthorType = @MJAIAgentNotes_SourceAIAgentRunID_AuthorType

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @MJAIAgentNotes_SourceAIAgentRunID_AuthorType
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_OriginatingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [OriginatingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_OriginatingAgentRunIDID, @AgentID = @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_OriginatingAgentRunID_Status, @Request = @MJAIAgentRequests_OriginatingAgentRunID_Request, @Response = @MJAIAgentRequests_OriginatingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_OriginatingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_OriginatingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @OriginatingAgentRunID_Clear = 1, @OriginatingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_ResumingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [ResumingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_ResumingAgentRunIDID, @AgentID = @MJAIAgentRequests_ResumingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_ResumingAgentRunID_Status, @Request = @MJAIAgentRequests_ResumingAgentRunID_Request, @Response = @MJAIAgentRequests_ResumingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_ResumingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_ResumingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @OriginatingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID_Clear = 1, @ResumingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia
    DECLARE @MJAIAgentRunMedias_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunMedia]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] @ID = @MJAIAgentRunMedias_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] @ID = @MJAIAgentRunSteps_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ParentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ParentRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_Success bit
    DECLARE @MJAIAgentRuns_ParentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ParentRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ParentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Verbose bit
    DECLARE @MJAIAgentRuns_ParentRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_ParentRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ParentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ParentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_AgentSessionID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRuns_ParentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ParentRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ParentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ParentRunID_ParentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ParentRunIDID, @AgentID = @MJAIAgentRuns_ParentRunID_AgentID, @ParentRunID_Clear = 1, @ParentRunID = @MJAIAgentRuns_ParentRunID_ParentRunID, @Status = @MJAIAgentRuns_ParentRunID_Status, @StartedAt = @MJAIAgentRuns_ParentRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_ParentRunID_CompletedAt, @Success = @MJAIAgentRuns_ParentRunID_Success, @ErrorMessage = @MJAIAgentRuns_ParentRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ParentRunID_ConversationID, @UserID = @MJAIAgentRuns_ParentRunID_UserID, @Result = @MJAIAgentRuns_ParentRunID_Result, @AgentState = @MJAIAgentRuns_ParentRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ParentRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ParentRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ParentRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ParentRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_ParentRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_ParentRunID_FinalPayload, @Message = @MJAIAgentRuns_ParentRunID_Message, @LastRunID = @MJAIAgentRuns_ParentRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_ParentRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ParentRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ParentRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ParentRunID_OverrideVendorID, @Data = @MJAIAgentRuns_ParentRunID_Data, @Verbose = @MJAIAgentRuns_ParentRunID_Verbose, @EffortLevel = @MJAIAgentRuns_ParentRunID_EffortLevel, @RunName = @MJAIAgentRuns_ParentRunID_RunName, @Comments = @MJAIAgentRuns_ParentRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ParentRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ParentRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ParentRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ParentRunID_AgentSessionID

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID
    END

    CLOSE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_LastRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_LastRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_Success bit
    DECLARE @MJAIAgentRuns_LastRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_LastRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_LastRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Verbose bit
    DECLARE @MJAIAgentRuns_LastRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_LastRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_LastRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_LastRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_AgentSessionID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRuns_LastRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [LastRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_LastRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_LastRunID_LastRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_LastRunIDID, @AgentID = @MJAIAgentRuns_LastRunID_AgentID, @ParentRunID = @MJAIAgentRuns_LastRunID_ParentRunID, @Status = @MJAIAgentRuns_LastRunID_Status, @StartedAt = @MJAIAgentRuns_LastRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_LastRunID_CompletedAt, @Success = @MJAIAgentRuns_LastRunID_Success, @ErrorMessage = @MJAIAgentRuns_LastRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_LastRunID_ConversationID, @UserID = @MJAIAgentRuns_LastRunID_UserID, @Result = @MJAIAgentRuns_LastRunID_Result, @AgentState = @MJAIAgentRuns_LastRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_LastRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_LastRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_LastRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_LastRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_LastRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_LastRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_LastRunID_FinalPayload, @Message = @MJAIAgentRuns_LastRunID_Message, @LastRunID_Clear = 1, @LastRunID = @MJAIAgentRuns_LastRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_LastRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_LastRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_LastRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_LastRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_LastRunID_OverrideVendorID, @Data = @MJAIAgentRuns_LastRunID_Data, @Verbose = @MJAIAgentRuns_LastRunID_Verbose, @EffortLevel = @MJAIAgentRuns_LastRunID_EffortLevel, @RunName = @MJAIAgentRuns_LastRunID_RunName, @Comments = @MJAIAgentRuns_LastRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_LastRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_LastRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_LastRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_LastRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_LastRunID_AgentSessionID

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID
    END

    CLOSE cascade_update_MJAIAgentRuns_LastRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_LastRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_Success bit
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopK int
    DECLARE @MJAIPromptRuns_AgentRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_Seed int
    DECLARE @MJAIPromptRuns_AgentRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentRunID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID, @MJAIPromptRuns_AgentRunID_AssistantPrefill, @MJAIPromptRuns_AgentRunID_TokensCacheRead, @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentRunIDID, @PromptID = @MJAIPromptRuns_AgentRunID_PromptID, @ModelID = @MJAIPromptRuns_AgentRunID_ModelID, @VendorID = @MJAIPromptRuns_AgentRunID_VendorID, @AgentID = @MJAIPromptRuns_AgentRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentRunID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentRunID_Messages, @Result = @MJAIPromptRuns_AgentRunID_Result, @TokensUsed = @MJAIPromptRuns_AgentRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentRunID_TotalCost, @Success = @MJAIPromptRuns_AgentRunID_Success, @ErrorMessage = @MJAIPromptRuns_AgentRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentRunID_ParentID, @RunType = @MJAIPromptRuns_AgentRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentRunID_ExecutionOrder, @AgentRunID_Clear = 1, @AgentRunID = @MJAIPromptRuns_AgentRunID_AgentRunID, @Cost = @MJAIPromptRuns_AgentRunID_Cost, @CostCurrency = @MJAIPromptRuns_AgentRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentRunID_Temperature, @TopP = @MJAIPromptRuns_AgentRunID_TopP, @TopK = @MJAIPromptRuns_AgentRunID_TopK, @MinP = @MJAIPromptRuns_AgentRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentRunID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentRunID_Seed, @StopSequences = @MJAIPromptRuns_AgentRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentRunID_ModelSelection, @Status = @MJAIPromptRuns_AgentRunID_Status, @Cancelled = @MJAIPromptRuns_AgentRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentRunID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentRunID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentRunID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentRunID_EffortLevel, @RunName = @MJAIPromptRuns_AgentRunID_RunName, @Comments = @MJAIPromptRuns_AgentRunID_Comments, @TestRunID = @MJAIPromptRuns_AgentRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentRunID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentRunID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID, @MJAIPromptRuns_AgentRunID_AssistantPrefill, @MJAIPromptRuns_AgentRunID_TokensCacheRead, @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    
    -- Cascade update on ExperimentSessionIteration using cursor to call spUpdateExperimentSessionIteration
    DECLARE @MJExperimentSessionIterations_AIAgentRunIDID uniqueidentifier
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID uniqueidentifier
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Sequence int
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Label nvarchar(255)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Score decimal(18, 6)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_ComputeCost decimal(18, 6)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_TokensUsed int
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Rationale nvarchar(MAX)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [ExperimentSessionID], [Sequence], [Label], [Status], [Score], [ComputeCost], [TokensUsed], [Rationale], [AIAgentRunID]
        FROM [${flyway:defaultSchema}].[ExperimentSessionIteration]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor INTO @MJExperimentSessionIterations_AIAgentRunIDID, @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @MJExperimentSessionIterations_AIAgentRunID_Sequence, @MJExperimentSessionIterations_AIAgentRunID_Label, @MJExperimentSessionIterations_AIAgentRunID_Status, @MJExperimentSessionIterations_AIAgentRunID_Score, @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @MJExperimentSessionIterations_AIAgentRunID_Rationale, @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateExperimentSessionIteration] @ID = @MJExperimentSessionIterations_AIAgentRunIDID, @ExperimentSessionID = @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @Sequence = @MJExperimentSessionIterations_AIAgentRunID_Sequence, @Label = @MJExperimentSessionIterations_AIAgentRunID_Label, @Status = @MJExperimentSessionIterations_AIAgentRunID_Status, @Score = @MJExperimentSessionIterations_AIAgentRunID_Score, @ComputeCost = @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @TokensUsed = @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @Rationale = @MJExperimentSessionIterations_AIAgentRunID_Rationale, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID

        FETCH NEXT FROM cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor INTO @MJExperimentSessionIterations_AIAgentRunIDID, @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @MJExperimentSessionIterations_AIAgentRunID_Sequence, @MJExperimentSessionIterations_AIAgentRunID_Label, @MJExperimentSessionIterations_AIAgentRunID_Status, @MJExperimentSessionIterations_AIAgentRunID_Score, @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @MJExperimentSessionIterations_AIAgentRunID_Rationale, @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID
    END

    CLOSE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    
    -- Cascade update on ExperimentSession using cursor to call spUpdateExperimentSession
    DECLARE @MJExperimentSessions_AgentRunIDID uniqueidentifier
    DECLARE @MJExperimentSessions_AgentRunID_ExperimentID uniqueidentifier
    DECLARE @MJExperimentSessions_AgentRunID_Name nvarchar(255)
    DECLARE @MJExperimentSessions_AgentRunID_Goal nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Budget nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Status nvarchar(20)
    DECLARE @MJExperimentSessions_AgentRunID_PlanSpec nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Leaderboard nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_AgentRunID uniqueidentifier
    DECLARE cascade_update_MJExperimentSessions_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [ExperimentID], [Name], [Goal], [Budget], [Status], [PlanSpec], [Leaderboard], [AgentRunID]
        FROM [${flyway:defaultSchema}].[ExperimentSession]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJExperimentSessions_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJExperimentSessions_AgentRunID_cursor INTO @MJExperimentSessions_AgentRunIDID, @MJExperimentSessions_AgentRunID_ExperimentID, @MJExperimentSessions_AgentRunID_Name, @MJExperimentSessions_AgentRunID_Goal, @MJExperimentSessions_AgentRunID_Budget, @MJExperimentSessions_AgentRunID_Status, @MJExperimentSessions_AgentRunID_PlanSpec, @MJExperimentSessions_AgentRunID_Leaderboard, @MJExperimentSessions_AgentRunID_AgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJExperimentSessions_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateExperimentSession] @ID = @MJExperimentSessions_AgentRunIDID, @ExperimentID = @MJExperimentSessions_AgentRunID_ExperimentID, @Name = @MJExperimentSessions_AgentRunID_Name, @Goal = @MJExperimentSessions_AgentRunID_Goal, @Budget = @MJExperimentSessions_AgentRunID_Budget, @Status = @MJExperimentSessions_AgentRunID_Status, @PlanSpec = @MJExperimentSessions_AgentRunID_PlanSpec, @Leaderboard = @MJExperimentSessions_AgentRunID_Leaderboard, @AgentRunID_Clear = 1, @AgentRunID = @MJExperimentSessions_AgentRunID_AgentRunID

        FETCH NEXT FROM cascade_update_MJExperimentSessions_AgentRunID_cursor INTO @MJExperimentSessions_AgentRunIDID, @MJExperimentSessions_AgentRunID_ExperimentID, @MJExperimentSessions_AgentRunID_Name, @MJExperimentSessions_AgentRunID_Goal, @MJExperimentSessions_AgentRunID_Budget, @MJExperimentSessions_AgentRunID_Status, @MJExperimentSessions_AgentRunID_PlanSpec, @MJExperimentSessions_AgentRunID_Leaderboard, @MJExperimentSessions_AgentRunID_AgentRunID
    END

    CLOSE cascade_update_MJExperimentSessions_AgentRunID_cursor
    DEALLOCATE cascade_update_MJExperimentSessions_AgentRunID_cursor
    
    -- Cascade update on ProcessRunDetail using cursor to call spUpdateProcessRunDetail
    DECLARE @MJProcessRunDetails_AIAgentRunIDID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_ProcessRunID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_EntityID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_RecordID nvarchar(450)
    DECLARE @MJProcessRunDetails_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJProcessRunDetails_AIAgentRunID_StartedAt datetimeoffset
    DECLARE @MJProcessRunDetails_AIAgentRunID_CompletedAt datetimeoffset
    DECLARE @MJProcessRunDetails_AIAgentRunID_DurationMs int
    DECLARE @MJProcessRunDetails_AIAgentRunID_AttemptCount int
    DECLARE @MJProcessRunDetails_AIAgentRunID_ResultPayload nvarchar(MAX)
    DECLARE @MJProcessRunDetails_AIAgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [ProcessRunID], [EntityID], [RecordID], [Status], [StartedAt], [CompletedAt], [DurationMs], [AttemptCount], [ResultPayload], [ErrorMessage], [ActionExecutionLogID], [AIAgentRunID]
        FROM [${flyway:defaultSchema}].[ProcessRunDetail]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJProcessRunDetails_AIAgentRunID_cursor INTO @MJProcessRunDetails_AIAgentRunIDID, @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @MJProcessRunDetails_AIAgentRunID_EntityID, @MJProcessRunDetails_AIAgentRunID_RecordID, @MJProcessRunDetails_AIAgentRunID_Status, @MJProcessRunDetails_AIAgentRunID_StartedAt, @MJProcessRunDetails_AIAgentRunID_CompletedAt, @MJProcessRunDetails_AIAgentRunID_DurationMs, @MJProcessRunDetails_AIAgentRunID_AttemptCount, @MJProcessRunDetails_AIAgentRunID_ResultPayload, @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @MJProcessRunDetails_AIAgentRunID_AIAgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJProcessRunDetails_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateProcessRunDetail] @ID = @MJProcessRunDetails_AIAgentRunIDID, @ProcessRunID = @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @EntityID = @MJProcessRunDetails_AIAgentRunID_EntityID, @RecordID = @MJProcessRunDetails_AIAgentRunID_RecordID, @Status = @MJProcessRunDetails_AIAgentRunID_Status, @StartedAt = @MJProcessRunDetails_AIAgentRunID_StartedAt, @CompletedAt = @MJProcessRunDetails_AIAgentRunID_CompletedAt, @DurationMs = @MJProcessRunDetails_AIAgentRunID_DurationMs, @AttemptCount = @MJProcessRunDetails_AIAgentRunID_AttemptCount, @ResultPayload = @MJProcessRunDetails_AIAgentRunID_ResultPayload, @ErrorMessage = @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @ActionExecutionLogID = @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJProcessRunDetails_AIAgentRunID_AIAgentRunID

        FETCH NEXT FROM cascade_update_MJProcessRunDetails_AIAgentRunID_cursor INTO @MJProcessRunDetails_AIAgentRunIDID, @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @MJProcessRunDetails_AIAgentRunID_EntityID, @MJProcessRunDetails_AIAgentRunID_RecordID, @MJProcessRunDetails_AIAgentRunID_Status, @MJProcessRunDetails_AIAgentRunID_StartedAt, @MJProcessRunDetails_AIAgentRunID_CompletedAt, @MJProcessRunDetails_AIAgentRunID_DurationMs, @MJProcessRunDetails_AIAgentRunID_AttemptCount, @MJProcessRunDetails_AIAgentRunID_ResultPayload, @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @MJProcessRunDetails_AIAgentRunID_AIAgentRunID
    END

    CLOSE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c8d30d60-e134-479c-8e73-1b3b48d8614a' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'TargetEntity')) BEGIN
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
            'c8d30d60-e134-479c-8e73-1b3b48d8614a',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100035,
            'TargetEntity',
            'Target Entity',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd62d8d8-a256-4152-bee3-3250a9387fa7' OR (EntityID = '4ECBC565-5795-460A-AE61-083BD7799765' AND Name = 'Algorithm')) BEGIN
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
            'fd62d8d8-a256-4152-bee3-3250a9387fa7',
            '4ECBC565-5795-460A-AE61-083BD7799765', -- Entity: MJ: ML Training Pipelines
            100036,
            'Algorithm',
            'Algorithm',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd07469b5-3856-438b-8bd1-c1f36ba0ab0e' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'Pipeline')) BEGIN
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
            'd07469b5-3856-438b-8bd1-c1f36ba0ab0e',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100039,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e705b71b-84fa-4190-9572-b9e7beb56a55' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'Algorithm')) BEGIN
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
            'e705b71b-84fa-4190-9572-b9e7beb56a55',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100040,
            'Algorithm',
            'Algorithm',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '244607cb-1591-4f10-95f7-833f8bd831a9' OR (EntityID = '109EDF71-1995-4A46-8EC8-09C2C2FF5310' AND Name = 'ArtifactFile')) BEGIN
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
            '244607cb-1591-4f10-95f7-833f8bd831a9',
            '109EDF71-1995-4A46-8EC8-09C2C2FF5310', -- Entity: MJ: ML Models
            100041,
            'ArtifactFile',
            'Artifact File',
            NULL,
            'nvarchar',
            1000,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '056f6890-1238-4661-bb57-c283d6ec870f' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'ExperimentSession')) BEGIN
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
            '056f6890-1238-4661-bb57-c283d6ec870f',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100025,
            'ExperimentSession',
            'Experiment Session',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd08472d5-b477-485a-ba53-fd4dbd47cca1' OR (EntityID = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E' AND Name = 'AIAgentRun')) BEGIN
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
            'd08472d5-b477-485a-ba53-fd4dbd47cca1',
            'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', -- Entity: MJ: Experiment Session Iterations
            100026,
            'AIAgentRun',
            'AI Agent Run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb50c575-200e-4dc4-9828-35efd276e58d' OR (EntityID = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C' AND Name = 'MLAlgorithm')) BEGIN
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
            'fb50c575-200e-4dc4-9828-35efd276e58d',
            'A3D384C6-AF3E-499A-9522-86FC1E58F15C', -- Entity: MJ: ML Algorithm Use Case Rankings
            100017,
            'MLAlgorithm',
            'ML Algorithm',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '78741ea7-97e6-4104-8545-7310c5d6edb4' OR (EntityID = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C' AND Name = 'MLAlgorithmUseCase')) BEGIN
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
            '78741ea7-97e6-4104-8545-7310c5d6edb4',
            'A3D384C6-AF3E-499A-9522-86FC1E58F15C', -- Entity: MJ: ML Algorithm Use Case Rankings
            100018,
            'MLAlgorithmUseCase',
            'ML Algorithm Use Case',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '05ab6073-9bd9-4b67-88ac-3656f49bfcff' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = 'Experiment')) BEGIN
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
            '05ab6073-9bd9-4b67-88ac-3656f49bfcff',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100023,
            'Experiment',
            'Experiment',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd627aec3-d343-4815-89d2-51323568143f' OR (EntityID = '7FD949B2-B950-464E-B702-B93D48709C0D' AND Name = 'AgentRun')) BEGIN
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
            'd627aec3-d343-4815-89d2-51323568143f',
            '7FD949B2-B950-464E-B702-B93D48709C0D', -- Entity: MJ: Experiment Sessions
            100024,
            'AgentRun',
            'Agent Run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f4c946e-2dee-4541-9ec5-90b4c3d9384f' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'Pipeline')) BEGIN
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
            '0f4c946e-2dee-4541-9ec5-90b4c3d9384f',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100033,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a060e232-3666-4c80-a1ef-eb17759ed83d' OR (EntityID = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00' AND Name = 'Algorithm')) BEGIN
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
            'a060e232-3666-4c80-a1ef-eb17759ed83d',
            'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', -- Entity: MJ: ML Training Runs
            100034,
            'Algorithm',
            'Algorithm',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6e5a6aa-abc1-4bdc-8028-187a0a9f735a' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = 'RecordProcess')) BEGIN
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
            'f6e5a6aa-abc1-4bdc-8028-187a0a9f735a',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100023,
            'RecordProcess',
            'Record Process',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e03e2c7b-36a4-459f-803b-2f0028696e9c' OR (EntityID = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D' AND Name = 'TargetEntity')) BEGIN
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
            'e03e2c7b-36a4-459f-803b-2f0028696e9c',
            'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', -- Entity: MJ: ML Model Scoring Bindings
            100024,
            'TargetEntity',
            'Target Entity',
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
               WHERE ID = '1A33BD29-B6F2-472D-AF94-11358449B70C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0DB103B2-ED6B-4054-A48E-EC0B154E52CC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '39DBA86B-893A-4488-AE47-F330E9E25646'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1A33BD29-B6F2-472D-AF94-11358449B70C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0DB103B2-ED6B-4054-A48E-EC0B154E52CC'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '3FDF43A7-7959-47F9-B300-98B939F4511F'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '0DB103B2-ED6B-4054-A48E-EC0B154E52CC'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '07BE7623-8EBC-446C-9AD6-8CA90A21F951'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F1253B94-4141-40FB-A635-BEA0D9951FE7'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '07BE7623-8EBC-446C-9AD6-8CA90A21F951'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3D7D3F5D-6B92-4ED8-A129-A2FE544A5A21'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B3F9BEF6-4C79-4EB0-965D-F0CE561E2338'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C18A8916-55A5-44F3-BBEF-C747C61F0B89'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7FD055A1-826D-4F3E-B62F-15C9740F3D98'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '07BE7623-8EBC-446C-9AD6-8CA90A21F951'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '25A7F474-E3A0-4B78-906E-727E486F526F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C5A93DBA-8EF0-4164-A49B-CC05983B4997'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '25A7F474-E3A0-4B78-906E-727E486F526F'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '25A7F474-E3A0-4B78-906E-727E486F526F'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '1233240E-257E-48BC-ABA2-4A08EF02BCDF'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1233240E-257E-48BC-ABA2-4A08EF02BCDF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C36BD154-D8FF-4381-9EDA-0630E06AD702'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '210D8DAA-6EF5-428D-8431-25BB0B710C0D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E03E2C7B-36A4-459F-803B-2F0028696E9C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1233240E-257E-48BC-ABA2-4A08EF02BCDF'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C36BD154-D8FF-4381-9EDA-0630E06AD702'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E03E2C7B-36A4-459F-803B-2F0028696E9C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'C36BD154-D8FF-4381-9EDA-0630E06AD702'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4A034660-BC06-4FB7-B360-4415CD779F93'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9C2E70F5-97F9-4C56-86CC-A0F041ABFCB3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C8D30D60-E134-479C-8E73-1B3B48D8614A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FD62D8D8-A256-4152-BEE3-3250A9387FA7'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C8D30D60-E134-479C-8E73-1B3B48D8614A'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FD62D8D8-A256-4152-BEE3-3250A9387FA7'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '14CAD8D8-92DE-4592-9DAB-3B6B48BF2831'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'C8D30D60-E134-479C-8E73-1B3B48D8614A'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'FD62D8D8-A256-4152-BEE3-3250A9387FA7'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '46B8C3C5-5898-4FC2-9F52-2D5FA42B2B8C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5BBFA945-4B8B-4B79-9009-013EE14D02AC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B45C5471-D226-4F0E-92F7-B4B0970AA0C4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '46B8C3C5-5898-4FC2-9F52-2D5FA42B2B8C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5BBFA945-4B8B-4B79-9009-013EE14D02AC'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '81971D05-8E1F-4838-8511-23FD458FA8E5'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '46B8C3C5-5898-4FC2-9F52-2D5FA42B2B8C'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '03868BE5-FBDC-4E0F-AC49-4C2A6E77B7EA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '72941A73-0772-4E15-8031-257BD8565946'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '116D5683-8FF0-4C11-AFA5-3359487FC9D3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0F4C946E-2DEE-4541-9EC5-90B4C3D9384F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A060E232-3666-4C80-A1EF-EB17759ED83D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '03868BE5-FBDC-4E0F-AC49-4C2A6E77B7EA'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6F42599C-FDE7-4DA8-A7D0-4D9DA863A162'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0F4C946E-2DEE-4541-9EC5-90B4C3D9384F'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A060E232-3666-4C80-A1EF-EB17759ED83D'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0F4C946E-2DEE-4541-9EC5-90B4C3D9384F'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'A060E232-3666-4C80-A1EF-EB17759ED83D'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '03868BE5-FBDC-4E0F-AC49-4C2A6E77B7EA'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '343BB07A-DCF9-40CB-BD40-85B6835BD0BB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '600B836F-2AB8-4BAA-895B-2C289BB27DC7'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '05AB6073-9BD9-4B67-88AC-3656F49BFCFF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D627AEC3-D343-4815-89D2-51323568143F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '343BB07A-DCF9-40CB-BD40-85B6835BD0BB'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '05AB6073-9BD9-4B67-88AC-3656F49BFCFF'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D627AEC3-D343-4815-89D2-51323568143F'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '343BB07A-DCF9-40CB-BD40-85B6835BD0BB'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0F53BFB1-6760-49AA-832B-81BF65B8C726'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '44071858-8BFD-4BD6-B07B-2693724F8D1D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FB50C575-200E-4DC4-9828-35EFD276E58D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '78741EA7-97E6-4104-8545-7310C5D6EDB4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '44071858-8BFD-4BD6-B07B-2693724F8D1D'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FB50C575-200E-4DC4-9828-35EFD276E58D'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '78741EA7-97E6-4104-8545-7310C5D6EDB4'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'FB50C575-200E-4DC4-9828-35EFD276E58D'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '78741EA7-97E6-4104-8545-7310C5D6EDB4'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '44071858-8BFD-4BD6-B07B-2693724F8D1D'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0819E526-3F2B-4CC1-8AAF-C333E492D398'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0F2F77F9-0F90-414E-9EFE-F94278C886D4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6E082D96-055E-47E1-AC7C-75DC337EAC80'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BCDF39F8-2F99-4328-9418-BBD19A9B503E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0C3635D2-AB83-4DB9-9DB7-DBD3047FAB55'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D07469B5-3856-438B-8BD1-C1F36BA0AB0E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0F2F77F9-0F90-414E-9EFE-F94278C886D4'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6E082D96-055E-47E1-AC7C-75DC337EAC80'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0C3635D2-AB83-4DB9-9DB7-DBD3047FAB55'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D07469B5-3856-438B-8BD1-C1F36BA0AB0E'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '6E082D96-055E-47E1-AC7C-75DC337EAC80'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '0C3635D2-AB83-4DB9-9DB7-DBD3047FAB55'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A2566EF-95DB-4632-A8D7-1F316B8CF98A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.ExperimentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Experiment',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D97E499F-298B-49D7-BA26-B54CB38F84BC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Experiment 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Experiment Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '05AB6073-9BD9-4B67-88AC-3656F49BFCFF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Session Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F6AF2DBF-00A3-48AE-9F30-420DB8B884F4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Goal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Goal Override',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DE4FB047-BA55-4844-B7A6-93B008D4CD61' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '343BB07A-DCF9-40CB-BD40-85B6835BD0BB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Budget 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Budget Configuration',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '5EDD86FE-9343-4338-9F81-6F5E55E22E9E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.PlanSpec 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Plan Specification',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '89513BE6-AB8E-4590-9202-A7544826DFFA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.AgentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Orchestration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7D2F1787-9140-44E4-A6A6-F7BC7CF3F6EA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.AgentRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Orchestration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D627AEC3-D343-4815-89D2-51323568143F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Leaderboard 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Orchestration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Leaderboard Snapshot',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'E988426B-4094-4A23-B62A-2A8451C537D7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '600B836F-2AB8-4BAA-895B-2C289BB27DC7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80A5F50E-28E9-4043-BDFE-9FB8AABEAF3B' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-flask */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-flask', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '7FD949B2-B950-464E-B702-B93D48709C0D';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a6f1dd9b-f2b0-4c9d-9ce5-ba4d3f36f7f7', '7FD949B2-B950-464E-B702-B93D48709C0D', 'FieldCategoryInfo', '{"Experiment Context":{"icon":"fa fa-info-circle","description":"Core identity and objective details for the experiment session"},"Execution Control":{"icon":"fa fa-sliders-h","description":"Configuration parameters for budgeting, planning, and current status"},"Orchestration":{"icon":"fa fa-robot","description":"Information regarding the AI agent control and performance tracking"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('72822637-82b7-436c-beae-ea7043e76154', '7FD949B2-B950-464E-B702-B93D48709C0D', 'FieldCategoryIcons', '{"Experiment Context":"fa fa-info-circle","Execution Control":"fa fa-sliders-h","Orchestration":"fa fa-robot","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '7FD949B2-B950-464E-B702-B93D48709C0D';

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8286648E-4445-42D0-AAF8-F46DF14D58E5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ExperimentSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Experiment Session',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4EA3399E-FB75-4F0A-9A94-FE280362D597' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ExperimentSession 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Experiment Session Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '056F6890-1238-4661-BB57-C283D6EC870F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1253B94-4141-40FB-A635-BEA0D9951FE7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3D7D3F5D-6B92-4ED8-A129-A2FE544A5A21' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Label 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07BE7623-8EBC-446C-9AD6-8CA90A21F951' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Score 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3F9BEF6-4C79-4EB0-965D-F0CE561E2338' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ComputeCost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C18A8916-55A5-44F3-BBEF-C747C61F0B89' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.TokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7FD055A1-826D-4F3E-B62F-15C9740F3D98' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Rationale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0FD2C008-CEB4-4E9F-AF0E-589ABE4B4DEA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.AIAgentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Agent Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93AA895A-7B21-4D34-AD2A-3B873F792903' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.AIAgentRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Agent Run Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D08472D5-B477-485A-BA53-FD4DBD47CCA1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '859936ED-6F51-4852-8D1B-61117F039805' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3BA6AD7D-CE62-469D-866E-9C42179EB452' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-microchip */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-microchip', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('5dba7d02-3688-4833-a913-da7ba24629fe', 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', 'FieldCategoryInfo', '{"Session Context":{"icon":"fa fa-layer-group","description":"Information linking the iteration to its parent experiment session and sequence"},"Execution Status":{"icon":"fa fa-tasks","description":"Status and descriptive labels for the iteration attempt"},"Performance Metrics":{"icon":"fa fa-chart-line","description":"Quantitative data regarding iteration score, compute cost, and token usage"},"Execution Details":{"icon":"fa fa-robot","description":"Agent reasoning and references to the underlying AI agent runs"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b445e4f3-a43c-4579-9f9f-75d160d484f4', 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E', 'FieldCategoryIcons', '{"Session Context":"fa fa-layer-group","Execution Status":"fa fa-tasks","Performance Metrics":"fa fa-chart-line","Execution Details":"fa fa-robot","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'FFB4BAE5-4FC3-4973-B38A-5E661203D54E';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: ML Algorithms.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8F43AD66-70E7-47C0-AA7A-3B70A0A829C0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Algorithm Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FDF43A7-7959-47F9-B300-98B939F4511F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Algorithm Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8AF50198-24EB-4A23-87CD-EFE23D9006D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Algorithm Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '39DBA86B-893A-4488-AE47-F330E9E25646' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.ProblemTypes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1A33BD29-B6F2-472D-AF94-11358449B70C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0DB103B2-ED6B-4054-A48E-EC0B154E52CC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.HyperparameterSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B29BAE0E-6510-420F-9774-D864A49F4B0C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.DefaultHyperparameters 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '8DD6157B-D52D-407D-90C2-ECC3A21C3B20' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.SupportsFeatureImportance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7115641-2514-4A4E-9151-BFD89E9CD0C5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '68CDE3CA-5971-4EFA-8D63-85F94AB9C1E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B212D3C4-D972-4F5A-A850-B36234212F7A' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '563629F3-3718-4A8D-A853-0337478A34FF';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a806802d-6dc7-4a2d-ad2a-622c17e47503', '563629F3-3718-4A8D-A853-0337478A34FF', 'FieldCategoryInfo', '{"Algorithm Profile":{"icon":"fa fa-info-circle","description":"Basic identification, description, and lifecycle status of the algorithm"},"Execution & Configuration":{"icon":"fa fa-sliders-h","description":"Technical parameters, problem types, and hyperparameter schemas required to execute the algorithm"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8da9e88c-7d6c-4ab1-a7d3-d5cb475ed46c', '563629F3-3718-4A8D-A853-0337478A34FF', 'FieldCategoryIcons', '{"Algorithm Profile":"fa fa-info-circle","Execution & Configuration":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '563629F3-3718-4A8D-A853-0337478A34FF';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Experiments.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '91DF60AF-6635-4B63-9B6D-57018245D8CD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '81971D05-8E1F-4838-8511-23FD458FA8E5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FA8D574-3E4D-4CE7-AF42-4CD4DDD9AAA2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.ExperimentType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '46B8C3C5-5898-4FC2-9F52-2D5FA42B2B8C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B45C5471-D226-4F0E-92F7-B4B0970AA0C4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.Goal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Optimization & Strategy',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A4AFE2C2-30DE-41EC-ACC5-2C8CAD2F08E9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.TargetMetric 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Optimization & Strategy',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5BBFA945-4B8B-4B79-9009-013EE14D02AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.PlanSpecTemplate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Optimization & Strategy',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'E5ABDFCA-472A-4B0E-B79E-6C643B0218D8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '864143AB-25DF-45D0-BDD8-D903C1D38393' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BEB952B4-C0BA-41E0-BAC3-F6DF8673EA36' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-flask */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-flask', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'B134A583-9297-4399-9234-7B1B223DB2C7';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('fed02265-2a08-4714-a9ce-db1439db93f6', 'B134A583-9297-4399-9234-7B1B223DB2C7', 'FieldCategoryInfo', '{"Experiment Profile":{"icon":"fa fa-vials","description":"Core identity, type, and status of the experiment."},"Optimization & Strategy":{"icon":"fa fa-bullseye","description":"Objectives, metrics, and template configurations for running the experiment."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8106cde8-fa8f-42e9-b174-a9204084d181', 'B134A583-9297-4399-9234-7B1B223DB2C7', 'FieldCategoryIcons', '{"Experiment Profile":"fa fa-vials","Optimization & Strategy":"fa fa-bullseye","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'B134A583-9297-4399-9234-7B1B223DB2C7';

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC4D8167-8E2C-4119-A3E3-896F0E31847A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.MLModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model & Process',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D29E295-C2BF-4168-9587-85802DE7278D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.RecordProcessID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model & Process',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9ED5A18F-CEA7-4BAE-BCCE-678324C3E825' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.RecordProcess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model & Process',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F6E5A6AA-ABC1-4BDC-8028-187A0A9F735A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.Mode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model & Process',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scoring Mode',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C36BD154-D8FF-4381-9EDA-0630E06AD702' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.TargetEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Destination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1858CC5-BB1A-45FC-8420-1CAF542AFC37' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.TargetEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Destination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E03E2C7B-36A4-459F-803B-2F0028696E9C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.TargetColumn 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Destination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1233240E-257E-48BC-ABA2-4A08EF02BCDF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.MaterializedResultID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Destination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61581A94-4CC7-4C16-A215-3C0C10FCED2D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.LastScoredAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '210D8DAA-6EF5-428D-8431-25BB0B710C0D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.LastRowCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F2A462C-D209-4425-A3B6-9C07789D5EAA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FA0D40CD-DDFB-41A1-BCB1-ABEE9F942395' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B6CFC24-0D96-403E-8733-5C1F89398B52' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-network-wired */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-network-wired', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1a60c744-8283-43da-a3e6-d9c3fee66311', 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', 'FieldCategoryInfo', '{"Model & Process":{"icon":"fa fa-microchip","description":"Configuration details linking the ML Model, scoring execution mode, and process runner."},"Target Destination":{"icon":"fa fa-bullseye","description":"The target entities, columns, and result mappings where the model scores are written."},"Scoring Metrics":{"icon":"fa fa-chart-bar","description":"Performance and execution statistics from the latest model scoring runs."},"System Metadata":{"icon":"fa fa-database","description":"Internal database identifiers and audit timestamps."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e2de3202-d023-46d1-aacc-cc892b43a53b', 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D', 'FieldCategoryIcons', '{"Model & Process":"fa fa-microchip","Target Destination":"fa fa-bullseye","Scoring Metrics":"fa fa-chart-bar","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'CA2C3F5C-BF62-4C96-95BF-EC6AC21D360D';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C8AC8A2-293B-4488-B6A2-CD42A9EB50E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '16D0527F-B5C5-48E2-B67A-DB0319E20E7D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C345D75-7F34-4BF1-88D8-C93CBE1037C0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.DisplayOrder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5A93DBA-8EF0-4164-A49B-CC05983B4997' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.ProblemTypeScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Classification & Guidance',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '25A7F474-E3A0-4B78-906E-727E486F526F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.Guidance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Classification & Guidance',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D13DD049-A037-4BD8-9586-232C0C1F336D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0FF290AB-29B7-435B-8876-1B1BBE236D4C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B256B1F6-4810-4B9F-A881-F99EEA533F90' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('73124ba8-6272-4fca-b079-58e3d574f7c2', 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C', 'FieldCategoryInfo', '{"Use Case Details":{"icon":"fa fa-lightbulb","description":"Basic details, naming, and presentation order of the machine learning scenario"},"Classification & Guidance":{"icon":"fa fa-compass","description":"Target problem scopes and decision-making guidance for algorithm selection"},"System Metadata":{"icon":"fa fa-cog","description":"System-generated identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0faa0ec4-2262-4f43-9d38-914709e0d53d', 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C', 'FieldCategoryIcons', '{"Use Case Details":"fa fa-lightbulb","Classification & Guidance":"fa fa-compass","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'AC6CBF38-AD96-4E3C-B13B-1F4A9601110C';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE1562A9-4F8E-45EB-BD4B-05D4FC9675BA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithmID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Algorithm & Use Case',
   GeneratedFormSection = 'Category',
   DisplayName = 'Algorithm',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8241724E-4838-4E2C-AD11-20379437F277' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithmUseCaseID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Algorithm & Use Case',
   GeneratedFormSection = 'Category',
   DisplayName = 'Use Case',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0130D794-BE82-4C28-AFB8-5446DAAE2236' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Algorithm & Use Case',
   GeneratedFormSection = 'Category',
   DisplayName = 'Algorithm Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB50C575-200E-4DC4-9828-35EFD276E58D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithmUseCase 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Algorithm & Use Case',
   GeneratedFormSection = 'Category',
   DisplayName = 'Use Case Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '78741EA7-97E6-4104-8545-7310C5D6EDB4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.SuitabilityScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Ranking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F53BFB1-6760-49AA-832B-81BF65B8C726' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.RecommendationLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Ranking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '44071858-8BFD-4BD6-B07B-2693724F8D1D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.Rationale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Ranking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5AF056C9-962F-484E-94DA-D5BFCCA31584' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C1AB1494-4849-4545-82F3-B82F043C8AE0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9039AE87-3F07-43B2-800A-229BC2609930' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ad5827c2-3d1e-485d-b52e-45fb9dec9827', 'A3D384C6-AF3E-499A-9522-86FC1E58F15C', 'FieldCategoryInfo', '{"Algorithm & Use Case":{"icon":"fa fa-project-diagram","description":"The machine learning algorithm and the specific use-case scenario being evaluated"},"Evaluation & Ranking":{"icon":"fa fa-star","description":"Suitability scores, recommendation levels, and plain-language rationales for the algorithm''s fit"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b7699998-4455-4748-9c0b-905dde484e81', 'A3D384C6-AF3E-499A-9522-86FC1E58F15C', 'FieldCategoryIcons', '{"Algorithm & Use Case":"fa fa-project-diagram","Evaluation & Ranking":"fa fa-star","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'A3D384C6-AF3E-499A-9522-86FC1E58F15C';

/* Set categories for 18 fields */

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '48E00241-9DAE-4CE2-BCB4-CC6557EF4B71' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.PipelineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5909321D-C26E-452B-B677-8643585DD22C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.Pipeline 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F4C946E-2DEE-4541-9EC5-90B4C3D9384F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.AlgorithmID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5CF7DF3-1023-4030-84F4-DCE22EDD62B0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.Algorithm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A060E232-3666-4C80-A1EF-EB17759ED83D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ExperimentSessionIterationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Experiment Session Iteration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '50D2D468-9D65-4961-9FBC-8AC8B304FE91' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.FeaturesUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '7065D7D4-C1BF-4092-B6D6-6C76920C13BA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.Hyperparameters 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'FF6FCDE3-8B53-4D04-9E1C-1ECF2F9C6A0D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '03868BE5-FBDC-4E0F-AC49-4C2A6E77B7EA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '72941A73-0772-4E15-8031-257BD8565946' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '763B1C26-74BA-4D01-B106-9D75BB8D076A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ResultingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resulting Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5D231E5-D45E-461E-AEED-8B235E4BBF02' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6F42599C-FDE7-4DA8-A7D0-4D9DA863A162' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ValidationResults 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Resource Usage',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'E3C6BD38-B3E7-47CA-BAFE-50C3CA8670E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ComputeCost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Resource Usage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '116D5683-8FF0-4C11-AFA5-3359487FC9D3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.TokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Resource Usage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A6CD41A8-C4FA-4385-8FBE-41F1174000CF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A58306DE-B5E4-496E-85F3-43E3D9D23A5A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BA9E946-5D56-4020-BB4C-5150992F8C84' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-flask */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-flask', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0797290e-b8ea-4108-840e-87a0412073a3', 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', 'FieldCategoryInfo', '{"Training Configuration":{"icon":"fa fa-sliders-h","description":"Algorithms, features, hyperparameters, and pipeline settings defining the training run setup."},"Execution & Status":{"icon":"fa fa-play-circle","description":"Information regarding run execution state, timelines, results, and notes."},"Metrics & Resource Usage":{"icon":"fa fa-chart-line","description":"Validation results, performance metrics, compute cost, and token utilization."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit logs and database identifiers."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2c025afa-557c-4ba7-9dcd-d0401f190e25', 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00', 'FieldCategoryIcons', '{"Training Configuration":"fa fa-sliders-h","Execution & Status":"fa fa-play-circle","Metrics & Resource Usage":"fa fa-chart-line","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'CBB07CBE-8C31-4F66-BF6D-E4B96C956D00';

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F0BE0613-B808-4FC3-B593-F8D763262C09' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '14CAD8D8-92DE-4592-9DAB-3B6B48BF2831' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D1DF0DC9-4682-4357-8C40-3D37AE5EEF80' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Version 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A034660-BC06-4FB7-B360-4415CD779F93' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C2E70F5-97F9-4C56-86CC-A0F041ABFCB3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.TargetEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Objective',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F00C9D6A-ECA5-4DC6-95CF-2C3FB52D061B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.TargetEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Objective',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C8D30D60-E134-479C-8E73-1B3B48D8614A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.TargetVariable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Objective',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8945DAB5-18E3-4936-88C3-76DBFE283706' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.ProblemType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Objective',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0737EC1A-58F8-4CDD-8482-D3F7309AC757' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.AlgorithmID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4778A54A-DB94-4134-9A46-FE57309B172A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Algorithm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD62D8D8-A256-4152-BEE3-3250A9387FA7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Hyperparameters 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '7FA89E9F-63FF-45E5-986F-AC6FCB4ADDAB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.SourceBindings 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Engineering',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '0B66961E-4328-4246-AB47-B6FC7CB39A68' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.FeatureSteps 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Engineering',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D77D0F1A-E5C5-4692-B80F-84A78A8A3B0E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.AsOfStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Engineering',
   GeneratedFormSection = 'Category',
   DisplayName = 'As-Of Strategy',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '97E5E102-6370-45D7-9DF0-45B0404E5653' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.LeakageGuard 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Engineering',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D1A92E30-AA81-412F-8B35-D94D214793A6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.ValidationStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '083E1B09-E0C9-4A64-831A-25199EC089C6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C2CC900F-C5BA-4B87-A0E7-C67C763F992A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1ED9BC4-E871-4DC0-A0AF-378C7745561D' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-route */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-route', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '4ECBC565-5795-460A-AE61-083BD7799765';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3a0d1d44-bb62-4782-960b-a28e9def744f', '4ECBC565-5795-460A-AE61-083BD7799765', 'FieldCategoryInfo', '{"Pipeline Overview":{"icon":"fa fa-info-circle","description":"Basic identity, status, and versioning of the training pipeline."},"Model Objective":{"icon":"fa fa-bullseye","description":"The target entity, variable, and problem type this pipeline aims to predict."},"Feature Engineering":{"icon":"fa fa-magic","description":"Data sources, feature assembly steps, leakage guards, and point-in-time strategies."},"Training & Validation":{"icon":"fa fa-flask","description":"Algorithm selection, hyperparameters, and validation strategies."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('48b18b90-78a0-4cda-8458-69ae8e83939d', '4ECBC565-5795-460A-AE61-083BD7799765', 'FieldCategoryIcons', '{"Pipeline Overview":"fa fa-info-circle","Model Objective":"fa fa-bullseye","Feature Engineering":"fa fa-magic","Training & Validation":"fa fa-flask","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '4ECBC565-5795-460A-AE61-083BD7799765';

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: ML Models.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E418FC2C-C333-40A0-AB87-7BCF22E0D3A0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.PipelineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '644DFC9E-D19F-432F-9D43-21BBE0C660D8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Pipeline 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D07469B5-3856-438B-8BD1-C1F36BA0AB0E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Version 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0819E526-3F2B-4CC1-8AAF-C333E492D398' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.AlgorithmID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7FFD971A-D247-4872-9E50-9D3A771D3C63' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Algorithm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E705B71B-84FA-4190-9572-B9E7BEB56A55' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactFileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A63B59C5-0DB4-4887-A1A3-EA70AF57D80C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactFile 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '244607CB-1591-4F10-95F7-833F8BD831A9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C3635D2-AB83-4DB9-9DB7-DBD3047FAB55' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Lineage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D4F94611-1396-4B3C-A0CB-52E2682AC1BB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.FeatureSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Features & Schema',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '8B3C40C6-3D78-4418-8B1D-16B2B445BCE2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.TargetVariable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Features & Schema',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F2F77F9-0F90-414E-9EFE-F94278C886D4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.ProblemType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Features & Schema',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6E082D96-055E-47E1-AC7C-75DC337EAC80' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.FittedPreprocessing 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Features & Schema',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'FF2B5A2E-4493-4269-880E-D42DCA4D3C43' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.TrainedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BCDF39F8-2F99-4328-9418-BBD19A9B503E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingDurationSec 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Duration (Seconds)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EC6D6F5F-4A10-49EB-A00C-82D664F9B423' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingRowCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB88B49E-6A49-45A4-9A53-5B33779DA8C0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Metrics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'DE115685-DBD6-44B1-9159-09F1B53038FB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.HoldoutMetrics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'C8923270-5538-47B8-9E5E-644AA4DBAF4A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.FeatureImportance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '41693BAA-747A-4580-875E-466818F0865A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6D4336BA-FE40-45CF-958B-5444BB60DDC1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '74C2EE68-B261-41CB-9D0F-6A3B276B41A5' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '109EDF71-1995-4A46-8EC8-09C2C2FF5310';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e1a3112b-8977-442d-bd4b-8636d1004341', '109EDF71-1995-4A46-8EC8-09C2C2FF5310', 'FieldCategoryInfo', '{"Model Identity & Lineage":{"icon":"fa fa-project-diagram","description":"Core identification, status, algorithm configuration, and lineage tracking for the model."},"Features & Schema":{"icon":"fa fa-list-ol","description":"Inputs, target variables, and fitted preprocessing transformations defining the model''s interface."},"Training & Performance":{"icon":"fa fa-chart-line","description":"Execution stats, training duration, and evaluation metrics on validation and holdout sets."},"System Metadata":{"icon":"fa fa-cog","description":"System-level creation and modification timestamps."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3d2b90f8-34d5-46c8-9620-b3735d6ec9c4', '109EDF71-1995-4A46-8EC8-09C2C2FF5310', 'FieldCategoryIcons', '{"Model Identity & Lineage":"fa fa-project-diagram","Features & Schema":"fa fa-list-ol","Training & Performance":"fa fa-chart-line","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '109EDF71-1995-4A46-8EC8-09C2C2FF5310';

/* Generated Validation Functions for MJ: ML Algorithm Use Case Rankings */
-- CHECK constraint for MJ: ML Algorithm Use Case Rankings: Field: SuitabilityScore was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([SuitabilityScore]>=(1) AND [SuitabilityScore]<=(5))', 'public ValidateSuitabilityScoreRange(result: ValidationResult) {
	if (this.SuitabilityScore != null && (this.SuitabilityScore < 1 || this.SuitabilityScore > 5)) {
		result.Errors.push(new ValidationErrorInfo(
			"SuitabilityScore",
			"The suitability score must be between 1 and 5.",
			this.SuitabilityScore,
			ValidationErrorType.Failure
		));
	}
}', 'The suitability score must be a value between 1 and 5 inclusive to ensure standard rating scales are maintained.', 'ValidateSuitabilityScoreRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0F53BFB1-6760-49AA-832B-81BF65B8C726');

