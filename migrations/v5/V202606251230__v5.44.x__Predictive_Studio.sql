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
