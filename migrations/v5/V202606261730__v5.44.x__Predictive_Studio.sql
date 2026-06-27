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
         '1a4df72f-68e0-410c-b42c-815687bfe2d2',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '1a4df72f-68e0-410c-b42c-815687bfe2d2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1a4df72f-68e0-410c-b42c-815687bfe2d2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1a4df72f-68e0-410c-b42c-815687bfe2d2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1a4df72f-68e0-410c-b42c-815687bfe2d2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         'fd8ef230-65f3-496d-a117-7610572c35aa',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'fd8ef230-65f3-496d-a117-7610572c35aa', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Model Scoring Bindings for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fd8ef230-65f3-496d-a117-7610572c35aa', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Model Scoring Bindings for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fd8ef230-65f3-496d-a117-7610572c35aa', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Model Scoring Bindings for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fd8ef230-65f3-496d-a117-7610572c35aa', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '26642380-432d-4527-85dd-fe7a96e57549',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '26642380-432d-4527-85dd-fe7a96e57549', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithms for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('26642380-432d-4527-85dd-fe7a96e57549', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithms for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('26642380-432d-4527-85dd-fe7a96e57549', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithms for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('26642380-432d-4527-85dd-fe7a96e57549', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '51a7bd55-6dc7-4162-8ad4-057e4b37ea0f',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '51a7bd55-6dc7-4162-8ad4-057e4b37ea0f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Cases for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('51a7bd55-6dc7-4162-8ad4-057e4b37ea0f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Cases for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('51a7bd55-6dc7-4162-8ad4-057e4b37ea0f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Cases for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('51a7bd55-6dc7-4162-8ad4-057e4b37ea0f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '05136fe9-994b-4c0f-926e-dee4d8d928c1',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '05136fe9-994b-4c0f-926e-dee4d8d928c1', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Case Rankings for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('05136fe9-994b-4c0f-926e-dee4d8d928c1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Case Rankings for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('05136fe9-994b-4c0f-926e-dee4d8d928c1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Algorithm Use Case Rankings for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('05136fe9-994b-4c0f-926e-dee4d8d928c1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '703fd109-331b-438d-902b-8e4a93c3f6aa',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '703fd109-331b-438d-902b-8e4a93c3f6aa', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Pipelines for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('703fd109-331b-438d-902b-8e4a93c3f6aa', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Pipelines for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('703fd109-331b-438d-902b-8e4a93c3f6aa', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Pipelines for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('703fd109-331b-438d-902b-8e4a93c3f6aa', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         'a3997636-011d-46e0-bc01-8b1e61e1087b',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a3997636-011d-46e0-bc01-8b1e61e1087b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Models for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3997636-011d-46e0-bc01-8b1e61e1087b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Models for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3997636-011d-46e0-bc01-8b1e61e1087b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Models for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3997636-011d-46e0-bc01-8b1e61e1087b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '232793cf-4406-4bcc-8022-0589c6ea6ef3',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '232793cf-4406-4bcc-8022-0589c6ea6ef3', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiments for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('232793cf-4406-4bcc-8022-0589c6ea6ef3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiments for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('232793cf-4406-4bcc-8022-0589c6ea6ef3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiments for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('232793cf-4406-4bcc-8022-0589c6ea6ef3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '0b20aa02-67cc-4b78-8680-fddd4b0e6198',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '0b20aa02-67cc-4b78-8680-fddd4b0e6198', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Sessions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0b20aa02-67cc-4b78-8680-fddd4b0e6198', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Sessions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0b20aa02-67cc-4b78-8680-fddd4b0e6198', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Sessions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0b20aa02-67cc-4b78-8680-fddd4b0e6198', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         'b3fa8ac2-b5db-4c3d-89a5-64b384fb3e38',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b3fa8ac2-b5db-4c3d-89a5-64b384fb3e38', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Session Iterations for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b3fa8ac2-b5db-4c3d-89a5-64b384fb3e38', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Session Iterations for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b3fa8ac2-b5db-4c3d-89a5-64b384fb3e38', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Experiment Session Iterations for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b3fa8ac2-b5db-4c3d-89a5-64b384fb3e38', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d980809-164f-4f29-b360-bcf4fbecb882' OR (EntityID = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6d980809-164f-4f29-b360-bcf4fbecb882',
            '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', -- Entity: MJ: ML Algorithm Use Cases
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69e1b728-8231-4181-aeaf-81f5c19c7042' OR (EntityID = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '69e1b728-8231-4181-aeaf-81f5c19c7042',
            '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', -- Entity: MJ: ML Algorithm Use Cases
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51acbd01-9bd3-43a2-9562-c4c338dc5b18' OR (EntityID = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '51acbd01-9bd3-43a2-9562-c4c338dc5b18',
            '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', -- Entity: MJ: ML Algorithm Use Cases
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cbd833aa-1c97-45e6-adc6-5101d31af5a4' OR (EntityID = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND Name = 'ProblemTypeScope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cbd833aa-1c97-45e6-adc6-5101d31af5a4',
            '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', -- Entity: MJ: ML Algorithm Use Cases
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4a0a11d-2953-42fe-b5f3-da0b2ecca343' OR (EntityID = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND Name = 'Guidance')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e4a0a11d-2953-42fe-b5f3-da0b2ecca343',
            '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', -- Entity: MJ: ML Algorithm Use Cases
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '424b1239-76c8-4fa0-b825-5f959fe1806e' OR (EntityID = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND Name = 'DisplayOrder')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '424b1239-76c8-4fa0-b825-5f959fe1806e',
            '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', -- Entity: MJ: ML Algorithm Use Cases
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e1e42a7a-d9e2-4763-bbaf-94a730936cac' OR (EntityID = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e1e42a7a-d9e2-4763-bbaf-94a730936cac',
            '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', -- Entity: MJ: ML Algorithm Use Cases
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66ae2491-e621-40bc-b500-b2a0e053f820' OR (EntityID = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '66ae2491-e621-40bc-b500-b2a0e053f820',
            '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', -- Entity: MJ: ML Algorithm Use Cases
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3729481-fe28-4891-9c14-c5a21dae93c8' OR (EntityID = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b3729481-fe28-4891-9c14-c5a21dae93c8',
            '232793CF-4406-4BCC-8022-0589C6EA6EF3', -- Entity: MJ: Experiments
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '43e65059-00a5-4847-a047-17b86f2e16c3' OR (EntityID = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '43e65059-00a5-4847-a047-17b86f2e16c3',
            '232793CF-4406-4BCC-8022-0589C6EA6EF3', -- Entity: MJ: Experiments
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '99b71188-3d89-46a1-af2c-0c61bdbfbd9f' OR (EntityID = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '99b71188-3d89-46a1-af2c-0c61bdbfbd9f',
            '232793CF-4406-4BCC-8022-0589C6EA6EF3', -- Entity: MJ: Experiments
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef0182f4-7c41-41c0-9ed6-e6573601054a' OR (EntityID = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND Name = 'ExperimentType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ef0182f4-7c41-41c0-9ed6-e6573601054a',
            '232793CF-4406-4BCC-8022-0589C6EA6EF3', -- Entity: MJ: Experiments
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dde443f0-f51e-401d-92bc-0b49a00f578f' OR (EntityID = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND Name = 'Goal')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dde443f0-f51e-401d-92bc-0b49a00f578f',
            '232793CF-4406-4BCC-8022-0589C6EA6EF3', -- Entity: MJ: Experiments
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f5e830e-4b7c-4cf0-a493-23cc34cb9e44' OR (EntityID = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND Name = 'TargetMetric')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5f5e830e-4b7c-4cf0-a493-23cc34cb9e44',
            '232793CF-4406-4BCC-8022-0589C6EA6EF3', -- Entity: MJ: Experiments
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7fc84cb6-0a55-4537-8b41-3bbdda2cd9a2' OR (EntityID = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND Name = 'PlanSpecTemplate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7fc84cb6-0a55-4537-8b41-3bbdda2cd9a2',
            '232793CF-4406-4BCC-8022-0589C6EA6EF3', -- Entity: MJ: Experiments
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0d7f9649-8909-4601-86ee-ba48c5a95582' OR (EntityID = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0d7f9649-8909-4601-86ee-ba48c5a95582',
            '232793CF-4406-4BCC-8022-0589C6EA6EF3', -- Entity: MJ: Experiments
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f55b3283-d82a-4a0e-a4f9-0c937ee114a1' OR (EntityID = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f55b3283-d82a-4a0e-a4f9-0c937ee114a1',
            '232793CF-4406-4BCC-8022-0589C6EA6EF3', -- Entity: MJ: Experiments
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fc3add0-bd34-4f92-bb62-4d0278bcb8e5' OR (EntityID = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2fc3add0-bd34-4f92-bb62-4d0278bcb8e5',
            '232793CF-4406-4BCC-8022-0589C6EA6EF3', -- Entity: MJ: Experiments
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e2efdd32-ca23-4b7b-994a-319c989828ad' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e2efdd32-ca23-4b7b-994a-319c989828ad',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'afb257ff-2710-4482-8d64-a5fb2e6dc0a4' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'ExperimentSessionID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'afb257ff-2710-4482-8d64-a5fb2e6dc0a4',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc54b44d-79ac-4c91-9760-a2a91e708e7a' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dc54b44d-79ac-4c91-9760-a2a91e708e7a',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af18f28e-58ef-4cfd-ba8e-b7c8d7a80f79' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'Label')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'af18f28e-58ef-4cfd-ba8e-b7c8d7a80f79',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6489a16d-9c97-4415-9d41-104732933d72' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6489a16d-9c97-4415-9d41-104732933d72',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8cbcdfc-f3d8-4adc-89e3-bdbd893d9f3f' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'Score')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd8cbcdfc-f3d8-4adc-89e3-bdbd893d9f3f',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ba87989-b7e1-4701-bda0-5983b6d0d5e7' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'ComputeCost')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4ba87989-b7e1-4701-bda0-5983b6d0d5e7',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c14c9aff-aa11-4443-ab07-f054e984726c' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'TokensUsed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c14c9aff-aa11-4443-ab07-f054e984726c',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c8e3bb7c-e0b6-49d5-9260-03368b09bd08' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'Rationale')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c8e3bb7c-e0b6-49d5-9260-03368b09bd08',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '19df8613-9f36-43c6-9ac9-0147f6b6b41b' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'AIAgentRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '19df8613-9f36-43c6-9ac9-0147f6b6b41b',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0be6ca2b-2e93-4661-a6d1-991a36304591' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0be6ca2b-2e93-4661-a6d1-991a36304591',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d67e4b4-c9f3-40a0-9afd-53b34a6df191' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3d67e4b4-c9f3-40a0-9afd-53b34a6df191',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d63c521-60a5-466f-a13f-e3b237cfb56d' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7d63c521-60a5-466f-a13f-e3b237cfb56d',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86fd001c-52e7-4a71-a475-f5c4878b7cc4' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'MLModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '86fd001c-52e7-4a71-a475-f5c4878b7cc4',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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
            'A3997636-011D-46E0-BC01-8B1E61E1087B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd2474e9-3f84-4e48-844f-9f4c59079ff7' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'RecordProcessID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cd2474e9-3f84-4e48-844f-9f4c59079ff7',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e8a46a8-ef56-4d67-b161-b78e41941936' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'TargetEntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4e8a46a8-ef56-4d67-b161-b78e41941936',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f9b34226-ceec-43f1-bb7b-db64448ac558' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'TargetColumn')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f9b34226-ceec-43f1-bb7b-db64448ac558',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '919000eb-f5b2-495f-93f4-ae6d2a1af119' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'Mode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '919000eb-f5b2-495f-93f4-ae6d2a1af119',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b041e1be-cc53-43d5-b446-ab7bf72fed60' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'MaterializedResultID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b041e1be-cc53-43d5-b446-ab7bf72fed60',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '390dcc0b-c014-4c34-a899-e574f3933890' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'LastScoredAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '390dcc0b-c014-4c34-a899-e574f3933890',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6cda85f4-965e-4835-96ea-58182d12f375' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'LastRowCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6cda85f4-965e-4835-96ea-58182d12f375',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '29ae7dd0-460a-4e82-b651-f940129346ce' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '29ae7dd0-460a-4e82-b651-f940129346ce',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a9d4e337-04c5-4e30-83c6-62b03d8e9343' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a9d4e337-04c5-4e30-83c6-62b03d8e9343',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ffd262b-18e6-449b-b103-ef59f59c317c' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7ffd262b-18e6-449b-b103-ef59f59c317c',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '05e0463c-130c-4b7c-8fc5-bf8c45640147' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'PipelineID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '05e0463c-130c-4b7c-8fc5-bf8c45640147',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '237cf3c4-7600-4c67-a368-73b9830ff3c2' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'ResultingModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '237cf3c4-7600-4c67-a368-73b9830ff3c2',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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
            'A3997636-011D-46E0-BC01-8B1E61E1087B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '657c631b-a990-4f3a-a881-8a06bab643d4' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'ExperimentSessionIterationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '657c631b-a990-4f3a-a881-8a06bab643d4',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be952da9-141a-4dc0-bfd9-ddfd414ccc59' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'FeaturesUsed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'be952da9-141a-4dc0-bfd9-ddfd414ccc59',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a774655-5497-4dea-9abc-694aef5ee8e3' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'AlgorithmID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4a774655-5497-4dea-9abc-694aef5ee8e3',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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
            '26642380-432D-4527-85DD-FE7A96E57549',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '740ae4c7-6ed5-41e6-9af4-9e91f347fc48' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'Hyperparameters')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '740ae4c7-6ed5-41e6-9af4-9e91f347fc48',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c61ab0ed-a92c-4fcd-851f-2e778995c89f' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'ValidationResults')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c61ab0ed-a92c-4fcd-851f-2e778995c89f',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '780aab1c-0740-4aed-83a7-dcbe8da2c843' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '780aab1c-0740-4aed-83a7-dcbe8da2c843',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ceb5decc-6d27-48d4-9e81-0f4abc6cf017' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'StartedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ceb5decc-6d27-48d4-9e81-0f4abc6cf017',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df11dbf7-c050-463b-87d4-9f2dc23cdacb' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'CompletedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'df11dbf7-c050-463b-87d4-9f2dc23cdacb',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22352411-c09a-416a-8110-81215ab22047' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'ComputeCost')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '22352411-c09a-416a-8110-81215ab22047',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a05882f-6969-41ee-91a4-8606bff23a8e' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'TokensUsed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a05882f-6969-41ee-91a4-8606bff23a8e',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e7f45990-3456-4cd8-ad90-46ba864a60d2' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'Notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e7f45990-3456-4cd8-ad90-46ba864a60d2',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0664ddd3-ed18-44be-a6a4-167959719288' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0664ddd3-ed18-44be-a6a4-167959719288',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '02798afd-669b-4c7d-b4a5-7d61100a3f75' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '02798afd-669b-4c7d-b4a5-7d61100a3f75',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '759d131a-7df7-4b85-9e0c-6db3bfc61084' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '759d131a-7df7-4b85-9e0c-6db3bfc61084',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cecbe6bf-4a2b-4d9b-9135-f372777ed18e' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'PipelineID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cecbe6bf-4a2b-4d9b-9135-f372777ed18e',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b871a401-2aa4-4b5c-942e-6afb401660c6' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Version')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b871a401-2aa4-4b5c-942e-6afb401660c6',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51e9a55b-d490-41b7-b4f3-2b429e18c71d' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'AlgorithmID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '51e9a55b-d490-41b7-b4f3-2b429e18c71d',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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
            '26642380-432D-4527-85DD-FE7A96E57549',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea625a1a-7553-41bd-9cf5-74bc41b541c7' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactFileID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ea625a1a-7553-41bd-9cf5-74bc41b541c7',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b17a1f8f-fc2d-4c5b-8e89-fcd67605ef49' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'FittedPreprocessing')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b17a1f8f-fc2d-4c5b-8e89-fcd67605ef49',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0bb4b332-de18-488a-b841-6c8bbac3bd9c' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'FeatureSchema')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0bb4b332-de18-488a-b841-6c8bbac3bd9c',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '052aa3ef-9b41-44c7-ac90-f9039d30a625' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TargetVariable')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '052aa3ef-9b41-44c7-ac90-f9039d30a625',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cb9357a-8739-4cb4-80eb-1dd0c0a0d9a0' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ProblemType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0cb9357a-8739-4cb4-80eb-1dd0c0a0d9a0',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd008101-49c0-4f82-852d-963b77f096a8' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Metrics')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dd008101-49c0-4f82-852d-963b77f096a8',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb2b1a50-0126-4374-88fa-d562c500da8e' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'HoldoutMetrics')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eb2b1a50-0126-4374-88fa-d562c500da8e',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86f10ce5-e0a9-47e5-8dd5-dc83d1a9622f' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'FeatureImportance')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '86f10ce5-e0a9-47e5-8dd5-dc83d1a9622f',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '91eebc4e-4a98-4b20-ba7b-aa9f82c61bc1' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Lineage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '91eebc4e-4a98-4b20-ba7b-aa9f82c61bc1',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94606151-4b72-423f-a494-e3230421752c' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '94606151-4b72-423f-a494-e3230421752c',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1065c3b7-ced6-4eed-a179-9fc98c8e9cdb' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingDurationSec')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1065c3b7-ced6-4eed-a179-9fc98c8e9cdb',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a33be812-e208-4410-8523-da31277508c4' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingRowCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a33be812-e208-4410-8523-da31277508c4',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b0c0799-d66a-48ba-987d-c32d477e2a28' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8b0c0799-d66a-48ba-987d-c32d477e2a28',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aed32800-6560-42f3-a8d3-06801c80476c' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aed32800-6560-42f3-a8d3-06801c80476c',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bba8940e-120a-4d50-a75d-7b598783f02b' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bba8940e-120a-4d50-a75d-7b598783f02b',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e458adcb-fccc-4074-a5ce-8d58d3ff8241' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e458adcb-fccc-4074-a5ce-8d58d3ff8241',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0613e52b-3280-4209-9b85-0a0feac23cda' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0613e52b-3280-4209-9b85-0a0feac23cda',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a9a161a-61be-4d2c-b603-675d7572c6cb' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5a9a161a-61be-4d2c-b603-675d7572c6cb',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '235b3ecf-9fc7-40b3-a3e7-f63758b1ad44' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'Version')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '235b3ecf-9fc7-40b3-a3e7-f63758b1ad44',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b7f8cd9-0491-493a-8961-b5b1e268b12b' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6b7f8cd9-0491-493a-8961-b5b1e268b12b',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30914c7c-6dda-409d-be74-dcecdeb57e32' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'TargetEntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '30914c7c-6dda-409d-be74-dcecdeb57e32',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '936424ab-347e-4e58-89d3-cd93e1a17b49' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'TargetVariable')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '936424ab-347e-4e58-89d3-cd93e1a17b49',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e245ef88-64a1-4f22-a954-ec44a431ce3e' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'ProblemType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e245ef88-64a1-4f22-a954-ec44a431ce3e',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bb4400a-0fe5-44f1-b565-4d0e69821d64' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'AlgorithmID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3bb4400a-0fe5-44f1-b565-4d0e69821d64',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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
            '26642380-432D-4527-85DD-FE7A96E57549',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '887a5948-0f5e-4e3d-824c-c1d4b636b761' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'Hyperparameters')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '887a5948-0f5e-4e3d-824c-c1d4b636b761',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f9cc6e74-1e94-4d15-97d8-faced9b94433' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'SourceBindings')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f9cc6e74-1e94-4d15-97d8-faced9b94433',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39701b36-19a8-45e5-b279-3a081ec3e5b0' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'FeatureSteps')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '39701b36-19a8-45e5-b279-3a081ec3e5b0',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b66d28b9-757f-45c2-a14d-bd2167627bff' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'AsOfStrategy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b66d28b9-757f-45c2-a14d-bd2167627bff',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b902f42b-3518-432a-8700-2c32e06704b3' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'LeakageGuard')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b902f42b-3518-432a-8700-2c32e06704b3',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a15d518-d028-4596-8124-9485865074a8' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'ValidationStrategy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a15d518-d028-4596-8124-9485865074a8',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7be270ef-bcb8-4354-a780-2820c12c38e5' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7be270ef-bcb8-4354-a780-2820c12c38e5',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0d82f95f-e227-4e90-b639-d001ee32a283' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0d82f95f-e227-4e90-b639-d001ee32a283',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '762c8803-fb39-4e24-b92f-4f18241256e1' OR (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'Subpath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '762c8803-fb39-4e24-b92f-4f18241256e1',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100043,
            'Subpath',
            'Subpath',
            'In-repo subdirectory the app was installed from for multi-app repositories (e.g. ''CRM/HubSpot''). NULL when the app''s mj-app.json is at the repository root.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d136b5a-cc4a-4355-b266-0f5dcafe2851' OR (EntityID = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7d136b5a-cc4a-4355-b266-0f5dcafe2851',
            '05136FE9-994B-4C0F-926E-DEE4D8D928C1', -- Entity: MJ: ML Algorithm Use Case Rankings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5443c622-f023-45c0-995b-e765b728a075' OR (EntityID = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND Name = 'MLAlgorithmID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5443c622-f023-45c0-995b-e765b728a075',
            '05136FE9-994B-4C0F-926E-DEE4D8D928C1', -- Entity: MJ: ML Algorithm Use Case Rankings
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
            '26642380-432D-4527-85DD-FE7A96E57549',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8bb6b63d-0c44-421d-b845-3c44365ec788' OR (EntityID = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND Name = 'MLAlgorithmUseCaseID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8bb6b63d-0c44-421d-b845-3c44365ec788',
            '05136FE9-994B-4C0F-926E-DEE4D8D928C1', -- Entity: MJ: ML Algorithm Use Case Rankings
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
            '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ffab2e2-84ae-441a-8aca-37bfcc40cdb6' OR (EntityID = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND Name = 'SuitabilityScore')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3ffab2e2-84ae-441a-8aca-37bfcc40cdb6',
            '05136FE9-994B-4C0F-926E-DEE4D8D928C1', -- Entity: MJ: ML Algorithm Use Case Rankings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '612df83c-8f49-43d9-9d30-eb9ff9d3e31e' OR (EntityID = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND Name = 'RecommendationLevel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '612df83c-8f49-43d9-9d30-eb9ff9d3e31e',
            '05136FE9-994B-4C0F-926E-DEE4D8D928C1', -- Entity: MJ: ML Algorithm Use Case Rankings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f7134e3-acbe-49f4-8a9f-71fc04d10039' OR (EntityID = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND Name = 'Rationale')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5f7134e3-acbe-49f4-8a9f-71fc04d10039',
            '05136FE9-994B-4C0F-926E-DEE4D8D928C1', -- Entity: MJ: ML Algorithm Use Case Rankings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c294ad9-d593-41e0-afa7-ac21bffde5e9' OR (EntityID = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2c294ad9-d593-41e0-afa7-ac21bffde5e9',
            '05136FE9-994B-4C0F-926E-DEE4D8D928C1', -- Entity: MJ: ML Algorithm Use Case Rankings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d085176-5132-4e19-a109-e1f963509374' OR (EntityID = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8d085176-5132-4e19-a109-e1f963509374',
            '05136FE9-994B-4C0F-926E-DEE4D8D928C1', -- Entity: MJ: ML Algorithm Use Case Rankings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd00f5797-ac83-4398-b3e3-d4b30e925aae' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd00f5797-ac83-4398-b3e3-d4b30e925aae',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5329588b-49b4-49a6-a0dc-300e9490ed00' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = 'ExperimentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5329588b-49b4-49a6-a0dc-300e9490ed00',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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
            '232793CF-4406-4BCC-8022-0589C6EA6EF3',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '49d424df-5006-49ff-bf6c-1fe96b65ebf3' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '49d424df-5006-49ff-bf6c-1fe96b65ebf3',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5ed3427-b34f-42a1-a513-f6953ea9d0c6' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = 'Goal')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e5ed3427-b34f-42a1-a513-f6953ea9d0c6',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7672a82d-9f28-4805-8f9e-1a60516c7c4e' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = 'Budget')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7672a82d-9f28-4805-8f9e-1a60516c7c4e',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '24dd5079-7579-4792-bd72-cd6db2db0ed0' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '24dd5079-7579-4792-bd72-cd6db2db0ed0',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ebc06e3-72d5-4f59-9650-8047a8e45946' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = 'PlanSpec')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4ebc06e3-72d5-4f59-9650-8047a8e45946',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8fa23ed8-71e9-44b5-bb8f-762b07e72b8b' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = 'Leaderboard')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8fa23ed8-71e9-44b5-bb8f-762b07e72b8b',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3e47f4d6-4653-41a8-bcd7-024fc9fc4280' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = 'AgentRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3e47f4d6-4653-41a8-bcd7-024fc9fc4280',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'baf736ac-d4c5-4021-bb99-b630122215a5' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'baf736ac-d4c5-4021-bb99-b630122215a5',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a43e613-d18d-4bc4-a611-219f16f3739c' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0a43e613-d18d-4bc4-a611-219f16f3739c',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee985bc9-0a22-4ed4-93dc-236fdbdf77d9' OR (EntityID = '26642380-432D-4527-85DD-FE7A96E57549' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ee985bc9-0a22-4ed4-93dc-236fdbdf77d9',
            '26642380-432D-4527-85DD-FE7A96E57549', -- Entity: MJ: ML Algorithms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15d6e08f-eb42-4cdc-b89b-80c63283cc8f' OR (EntityID = '26642380-432D-4527-85DD-FE7A96E57549' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '15d6e08f-eb42-4cdc-b89b-80c63283cc8f',
            '26642380-432D-4527-85DD-FE7A96E57549', -- Entity: MJ: ML Algorithms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e8fc4567-5cb4-4ccf-aade-9b7dd38f3f43' OR (EntityID = '26642380-432D-4527-85DD-FE7A96E57549' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e8fc4567-5cb4-4ccf-aade-9b7dd38f3f43',
            '26642380-432D-4527-85DD-FE7A96E57549', -- Entity: MJ: ML Algorithms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1597cd31-a1d4-4447-be0d-c72dcd2e3874' OR (EntityID = '26642380-432D-4527-85DD-FE7A96E57549' AND Name = 'ProblemTypes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1597cd31-a1d4-4447-be0d-c72dcd2e3874',
            '26642380-432D-4527-85DD-FE7A96E57549', -- Entity: MJ: ML Algorithms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5f38db5-011d-41fe-96e8-d5d2baeb9150' OR (EntityID = '26642380-432D-4527-85DD-FE7A96E57549' AND Name = 'DriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a5f38db5-011d-41fe-96e8-d5d2baeb9150',
            '26642380-432D-4527-85DD-FE7A96E57549', -- Entity: MJ: ML Algorithms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a180ce96-0d60-4b85-8f93-b56d26374546' OR (EntityID = '26642380-432D-4527-85DD-FE7A96E57549' AND Name = 'HyperparameterSchema')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a180ce96-0d60-4b85-8f93-b56d26374546',
            '26642380-432D-4527-85DD-FE7A96E57549', -- Entity: MJ: ML Algorithms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2b8e114-843e-4dd9-99bc-87d3d492ea9a' OR (EntityID = '26642380-432D-4527-85DD-FE7A96E57549' AND Name = 'DefaultHyperparameters')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f2b8e114-843e-4dd9-99bc-87d3d492ea9a',
            '26642380-432D-4527-85DD-FE7A96E57549', -- Entity: MJ: ML Algorithms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd3c4a5a5-54e3-4d70-b07a-f31e2f76a367' OR (EntityID = '26642380-432D-4527-85DD-FE7A96E57549' AND Name = 'SupportsFeatureImportance')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd3c4a5a5-54e3-4d70-b07a-f31e2f76a367',
            '26642380-432D-4527-85DD-FE7A96E57549', -- Entity: MJ: ML Algorithms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '65776a4c-7173-40f8-aea8-6e5e24ac7227' OR (EntityID = '26642380-432D-4527-85DD-FE7A96E57549' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '65776a4c-7173-40f8-aea8-6e5e24ac7227',
            '26642380-432D-4527-85DD-FE7A96E57549', -- Entity: MJ: ML Algorithms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68d8b8b2-145f-416c-af88-3d83f85a76fc' OR (EntityID = '26642380-432D-4527-85DD-FE7A96E57549' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '68d8b8b2-145f-416c-af88-3d83f85a76fc',
            '26642380-432D-4527-85DD-FE7A96E57549', -- Entity: MJ: ML Algorithms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c47e0f6-fd2a-44d8-b53b-722d8c9f3939' OR (EntityID = '26642380-432D-4527-85DD-FE7A96E57549' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9c47e0f6-fd2a-44d8-b53b-722d8c9f3939',
            '26642380-432D-4527-85DD-FE7A96E57549', -- Entity: MJ: ML Algorithms
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

/* SQL text to insert entity field value with ID 2bfa9080-33b0-4e56-a876-0e815654db9b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2bfa9080-33b0-4e56-a876-0e815654db9b', '6489A16D-9C97-4415-9D41-104732933D72', 1, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 82ed4901-f383-4cf9-b919-5b42b0c5712e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('82ed4901-f383-4cf9-b919-5b42b0c5712e', '6489A16D-9C97-4415-9D41-104732933D72', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID caf5c61c-6441-4bc7-8cac-91d326bfe8be */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('caf5c61c-6441-4bc7-8cac-91d326bfe8be', '6489A16D-9C97-4415-9D41-104732933D72', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 701210c6-ee19-48a4-aa21-1572a120efd3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('701210c6-ee19-48a4-aa21-1572a120efd3', '6489A16D-9C97-4415-9D41-104732933D72', 4, 'Pruned', 'Pruned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3668b281-1edb-439f-9b33-b6233c3e5794 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3668b281-1edb-439f-9b33-b6233c3e5794', '6489A16D-9C97-4415-9D41-104732933D72', 5, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 6489A16D-9C97-4415-9D41-104732933D72 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6489A16D-9C97-4415-9D41-104732933D72';

/* SQL text to insert entity field value with ID 0e03d7fa-6eff-4b65-be07-6691429199ad */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0e03d7fa-6eff-4b65-be07-6691429199ad', '780AAB1C-0740-4AED-83A7-DCBE8DA2C843', 1, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 74138ee8-1e52-4129-ae35-860ba4306114 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('74138ee8-1e52-4129-ae35-860ba4306114', '780AAB1C-0740-4AED-83A7-DCBE8DA2C843', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4b720a8e-34b1-4a78-bd23-5ecb89338b8f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4b720a8e-34b1-4a78-bd23-5ecb89338b8f', '780AAB1C-0740-4AED-83A7-DCBE8DA2C843', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6cc0e2a1-f162-40a5-a371-7372959b1e8c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6cc0e2a1-f162-40a5-a371-7372959b1e8c', '780AAB1C-0740-4AED-83A7-DCBE8DA2C843', 4, 'Pruned', 'Pruned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 97c73e83-1b39-4339-861a-dbe2a793243d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('97c73e83-1b39-4339-861a-dbe2a793243d', '780AAB1C-0740-4AED-83A7-DCBE8DA2C843', 5, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 780AAB1C-0740-4AED-83A7-DCBE8DA2C843 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='780AAB1C-0740-4AED-83A7-DCBE8DA2C843';

/* SQL text to insert entity field value with ID 285ab7f0-40c8-4455-a23a-8fc67d2c867c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('285ab7f0-40c8-4455-a23a-8fc67d2c867c', '919000EB-F5B2-495F-93F4-AE6D2A1AF119', 1, 'Materialized', 'Materialized', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 774af3cf-cbfd-4cec-8e08-97f1eae6039f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('774af3cf-cbfd-4cec-8e08-97f1eae6039f', '919000EB-F5B2-495F-93F4-AE6D2A1AF119', 2, 'OnDemand', 'OnDemand', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 59bf12a1-78dc-4042-9243-93935e738a59 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('59bf12a1-78dc-4042-9243-93935e738a59', '919000EB-F5B2-495F-93F4-AE6D2A1AF119', 3, 'Scheduled', 'Scheduled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 919000EB-F5B2-495F-93F4-AE6D2A1AF119 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='919000EB-F5B2-495F-93F4-AE6D2A1AF119';

/* SQL text to insert entity field value with ID d325939d-2b36-4920-8a89-5bebf590ad44 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d325939d-2b36-4920-8a89-5bebf590ad44', '65776A4C-7173-40F8-AEA8-6E5E24AC7227', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 03608d43-92a7-44a2-b9f2-cc154fa67b28 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('03608d43-92a7-44a2-b9f2-cc154fa67b28', '65776A4C-7173-40F8-AEA8-6E5E24AC7227', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 65776A4C-7173-40F8-AEA8-6E5E24AC7227 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='65776A4C-7173-40F8-AEA8-6E5E24AC7227';

/* SQL text to insert entity field value with ID d914382b-d575-41c9-b79e-1315efa7ee60 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d914382b-d575-41c9-b79e-1315efa7ee60', 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4', 1, 'any', 'any', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bef0fcc5-82a9-4365-9977-01fd1a8b315f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bef0fcc5-82a9-4365-9977-01fd1a8b315f', 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4', 2, 'classification', 'classification', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 695663a3-5b03-42b4-9a90-39bc4f470be9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('695663a3-5b03-42b4-9a90-39bc4f470be9', 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4', 3, 'regression', 'regression', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CBD833AA-1C97-45E6-ADC6-5101D31AF5A4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CBD833AA-1C97-45E6-ADC6-5101D31AF5A4';

/* SQL text to insert entity field value with ID e2ca4f08-9f8e-45f9-b664-45cc8cb93b09 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e2ca4f08-9f8e-45f9-b664-45cc8cb93b09', '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E', 1, 'NotRecommended', 'NotRecommended', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 79fdfedb-b6d7-4f00-931f-7d5f29aeb2dc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('79fdfedb-b6d7-4f00-931f-7d5f29aeb2dc', '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E', 2, 'Primary', 'Primary', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 20d84a1d-f423-46ef-aa8f-ebaa84c04278 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('20d84a1d-f423-46ef-aa8f-ebaa84c04278', '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E', 3, 'Strong', 'Strong', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 01ae0072-264f-4fd2-8010-799bef165469 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('01ae0072-264f-4fd2-8010-799bef165469', '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E', 4, 'Viable', 'Viable', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3f5b4a07-5ab1-48c5-994a-130547e9e2e3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3f5b4a07-5ab1-48c5-994a-130547e9e2e3', '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E', 5, 'Weak', 'Weak', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 612DF83C-8F49-43D9-9D30-EB9FF9D3E31E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='612DF83C-8F49-43D9-9D30-EB9FF9D3E31E';

/* SQL text to insert entity field value with ID 86008bc6-e762-4a63-bafa-fffd9c243dbd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('86008bc6-e762-4a63-bafa-fffd9c243dbd', '6B7F8CD9-0491-493A-8961-B5B1E268B12B', 1, 'Archived', 'Archived', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4f8f1649-b09d-4ad5-a687-0bd6d92c2c4d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4f8f1649-b09d-4ad5-a687-0bd6d92c2c4d', '6B7F8CD9-0491-493A-8961-B5B1E268B12B', 2, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 589168e9-011a-4fd4-b168-daaab2dfe3d6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('589168e9-011a-4fd4-b168-daaab2dfe3d6', '6B7F8CD9-0491-493A-8961-B5B1E268B12B', 3, 'Published', 'Published', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 6B7F8CD9-0491-493A-8961-B5B1E268B12B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6B7F8CD9-0491-493A-8961-B5B1E268B12B';

/* SQL text to insert entity field value with ID cbc185ff-72d0-4bf1-bd4f-c0f9ba28e2e7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cbc185ff-72d0-4bf1-bd4f-c0f9ba28e2e7', 'E245EF88-64A1-4F22-A954-EC44A431CE3E', 1, 'classification', 'classification', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5e1182d7-9450-4107-a24d-327e6b455317 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5e1182d7-9450-4107-a24d-327e6b455317', 'E245EF88-64A1-4F22-A954-EC44A431CE3E', 2, 'regression', 'regression', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E245EF88-64A1-4F22-A954-EC44A431CE3E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E245EF88-64A1-4F22-A954-EC44A431CE3E';

/* SQL text to insert entity field value with ID 3617bf1d-ed43-4f64-a2a9-34e582be9ba3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3617bf1d-ed43-4f64-a2a9-34e582be9ba3', '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0', 1, 'classification', 'classification', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ed520962-2b56-4cb0-8426-71850f01c597 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ed520962-2b56-4cb0-8426-71850f01c597', '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0', 2, 'regression', 'regression', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0';

/* SQL text to insert entity field value with ID 40ef12a2-7585-40e0-9d9f-95569751482b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('40ef12a2-7585-40e0-9d9f-95569751482b', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 1, 'Archived', 'Archived', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID eccee1ce-a8e5-45e0-a317-0eb26779d9c9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eccee1ce-a8e5-45e0-a317-0eb26779d9c9', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 2, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c2ce99ca-0e5d-4227-b71d-55a34c1b1f84 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c2ce99ca-0e5d-4227-b71d-55a34c1b1f84', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 3, 'Published', 'Published', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5f645bca-78a6-4f2f-b01d-1ae7ed48bfc8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5f645bca-78a6-4f2f-b01d-1ae7ed48bfc8', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 4, 'Validated', 'Validated', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 8B0C0799-D66A-48BA-987D-C32D477E2A28 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8B0C0799-D66A-48BA-987D-C32D477E2A28';

/* SQL text to insert entity field value with ID 56d62ebd-30f0-47a8-9631-79f8d0ad0070 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('56d62ebd-30f0-47a8-9631-79f8d0ad0070', '0D7F9649-8909-4601-86EE-BA48C5A95582', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f52302df-76b7-4602-a1a7-fedf970e7259 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f52302df-76b7-4602-a1a7-fedf970e7259', '0D7F9649-8909-4601-86EE-BA48C5A95582', 2, 'Archived', 'Archived', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0D7F9649-8909-4601-86EE-BA48C5A95582 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0D7F9649-8909-4601-86EE-BA48C5A95582';

/* SQL text to insert entity field value with ID fd91f9a0-de28-4cea-be00-0fdd9c986691 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fd91f9a0-de28-4cea-be00-0fdd9c986691', '24DD5079-7579-4792-BD72-CD6DB2DB0ED0', 1, 'AwaitingApproval', 'AwaitingApproval', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 00147175-b620-4161-aa9d-e9ace8a27db9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('00147175-b620-4161-aa9d-e9ace8a27db9', '24DD5079-7579-4792-BD72-CD6DB2DB0ED0', 2, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0e2e5229-a7cb-4a66-bb26-aae8c4ca8f14 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0e2e5229-a7cb-4a66-bb26-aae8c4ca8f14', '24DD5079-7579-4792-BD72-CD6DB2DB0ED0', 3, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d0f2f195-7904-4802-a8a2-43bdace12f0b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d0f2f195-7904-4802-a8a2-43bdace12f0b', '24DD5079-7579-4792-BD72-CD6DB2DB0ED0', 4, 'Paused', 'Paused', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 577009b5-6d9b-4215-9a81-85d5cc88d90e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('577009b5-6d9b-4215-9a81-85d5cc88d90e', '24DD5079-7579-4792-BD72-CD6DB2DB0ED0', 5, 'Planning', 'Planning', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a36634f1-b7a8-49ae-89b4-a7d93108dbea */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a36634f1-b7a8-49ae-89b4-a7d93108dbea', '24DD5079-7579-4792-BD72-CD6DB2DB0ED0', 6, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 24DD5079-7579-4792-BD72-CD6DB2DB0ED0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='24DD5079-7579-4792-BD72-CD6DB2DB0ED0';


/* Create Entity Relationship: MJ: ML Algorithm Use Cases -> MJ: ML Algorithm Use Case Rankings (One To Many via MLAlgorithmUseCaseID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dbfa0041-a53a-484b-a186-c4342370d08e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dbfa0041-a53a-484b-a186-c4342370d08e', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', '05136FE9-994B-4C0F-926E-DEE4D8D928C1', 'MLAlgorithmUseCaseID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Experiments -> MJ: Experiment Sessions (One To Many via ExperimentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e25db55a-d46d-411d-b363-3a13af6feba1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e25db55a-d46d-411d-b363-3a13af6feba1', '232793CF-4406-4BCC-8022-0589C6EA6EF3', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', 'ExperimentID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: Experiment Session Iterations (One To Many via AIAgentRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '888f33a9-3ed9-42de-b5db-a31e04c59d94'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('888f33a9-3ed9-42de-b5db-a31e04c59d94', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', 'AIAgentRunID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: Experiment Sessions (One To Many via AgentRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '69d30b78-5e6a-4765-9351-47a7ce056921'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('69d30b78-5e6a-4765-9351-47a7ce056921', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', 'AgentRunID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: ML Training Pipelines (One To Many via TargetEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '42815065-3419-4f77-85c2-ee69bdc347a6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('42815065-3419-4f77-85c2-ee69bdc347a6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'TargetEntityID', 'One To Many', 1, 1, 67, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: ML Model Scoring Bindings (One To Many via TargetEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2d4b2674-1cdc-4dbb-8d3e-15be0cae1c7c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2d4b2674-1cdc-4dbb-8d3e-15be0cae1c7c', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'TargetEntityID', 'One To Many', 1, 1, 68, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Files -> MJ: ML Models (One To Many via ArtifactFileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'cf569ae7-5988-4f75-bd34-85ebd9684618'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('cf569ae7-5988-4f75-bd34-85ebd9684618', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'ArtifactFileID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Experiment Session Iterations -> MJ: ML Training Runs (One To Many via ExperimentSessionIterationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a53a0f11-14a1-4af3-8850-cb44afce4c40'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a53a0f11-14a1-4af3-8850-cb44afce4c40', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'ExperimentSessionIterationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Models -> MJ: ML Training Runs (One To Many via ResultingModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1c03e8a6-cc87-4cfd-94f1-21e85cea9239'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1c03e8a6-cc87-4cfd-94f1-21e85cea9239', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'ResultingModelID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Model Scoring Bindings (One To Many via MLModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b3324f8a-5e80-4c82-a929-5cf1b8e5d015'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b3324f8a-5e80-4c82-a929-5cf1b8e5d015', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'MLModelID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Pipelines -> MJ: ML Training Runs (One To Many via PipelineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '288fa1e8-51f9-4567-8876-e6d7d867c167'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('288fa1e8-51f9-4567-8876-e6d7d867c167', '703FD109-331B-438D-902B-8E4A93C3F6AA', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'PipelineID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Training Pipelines -> MJ: ML Models (One To Many via PipelineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6dc44e30-f262-4413-9bf6-4fdeb6494527'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6dc44e30-f262-4413-9bf6-4fdeb6494527', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'PipelineID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Record Processes -> MJ: ML Model Scoring Bindings (One To Many via RecordProcessID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c792c88d-31f8-40c6-9d2a-2349938ccf1b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c792c88d-31f8-40c6-9d2a-2349938ccf1b', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'RecordProcessID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Experiment Sessions -> MJ: Experiment Session Iterations (One To Many via ExperimentSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9aae02cb-7a89-45c5-b94c-ec6e00f81851'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9aae02cb-7a89-45c5-b94c-ec6e00f81851', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', 'ExperimentSessionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Algorithms -> MJ: ML Training Runs (One To Many via AlgorithmID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fe61be9f-0ec6-4d81-a85d-a7b9bbb42e5c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fe61be9f-0ec6-4d81-a85d-a7b9bbb42e5c', '26642380-432D-4527-85DD-FE7A96E57549', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'AlgorithmID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Algorithms -> MJ: ML Training Pipelines (One To Many via AlgorithmID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e544b258-d52c-406d-9866-40b853c6297a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e544b258-d52c-406d-9866-40b853c6297a', '26642380-432D-4527-85DD-FE7A96E57549', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'AlgorithmID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Algorithms -> MJ: ML Models (One To Many via AlgorithmID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4893ea23-7f6d-4a0b-b732-ace427479137'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4893ea23-7f6d-4a0b-b732-ace427479137', '26642380-432D-4527-85DD-FE7A96E57549', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'AlgorithmID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Algorithms -> MJ: ML Algorithm Use Case Rankings (One To Many via MLAlgorithmID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f96681d9-5b93-44b0-abed-581cc423c90c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f96681d9-5b93-44b0-abed-581cc423c90c', '26642380-432D-4527-85DD-FE7A96E57549', '05136FE9-994B-4C0F-926E-DEE4D8D928C1', 'MLAlgorithmID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID AFB257FF-2710-4482-8D64-A5FB2E6DC0A4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='AFB257FF-2710-4482-8D64-A5FB2E6DC0A4', @RelatedEntityNameFieldMap='ExperimentSession';

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

/* SQL text to update entity field related entity name field map for entity field ID 5329588B-49B4-49A6-A0DC-300E9490ED00 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5329588B-49B4-49A6-A0DC-300E9490ED00', @RelatedEntityNameFieldMap='Experiment';

/* SQL text to update entity field related entity name field map for entity field ID 3E47F4D6-4653-41A8-BCD7-024FC9FC4280 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3E47F4D6-4653-41A8-BCD7-024FC9FC4280', @RelatedEntityNameFieldMap='AgentRun';

/* SQL text to update entity field related entity name field map for entity field ID 19DF8613-9F36-43C6-9AC9-0147F6B6B41B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='19DF8613-9F36-43C6-9AC9-0147F6B6B41B', @RelatedEntityNameFieldMap='AIAgentRun';

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

/* SQL text to update entity field related entity name field map for entity field ID 5443C622-F023-45C0-995B-E765B728A075 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5443C622-F023-45C0-995B-E765B728A075', @RelatedEntityNameFieldMap='MLAlgorithm';

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

/* SQL text to update entity field related entity name field map for entity field ID 8BB6B63D-0C44-421D-B845-3C44365EC788 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8BB6B63D-0C44-421D-B845-3C44365EC788', @RelatedEntityNameFieldMap='MLAlgorithmUseCase';

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

/* SQL text to update entity field related entity name field map for entity field ID CD2474E9-3F84-4E48-844F-9F4C59079FF7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CD2474E9-3F84-4E48-844F-9F4C59079FF7', @RelatedEntityNameFieldMap='RecordProcess';

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

/* SQL text to update entity field related entity name field map for entity field ID CECBE6BF-4A2B-4D9B-9135-F372777ED18E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CECBE6BF-4A2B-4D9B-9135-F372777ED18E', @RelatedEntityNameFieldMap='Pipeline';

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

/* SQL text to update entity field related entity name field map for entity field ID 30914C7C-6DDA-409D-BE74-DCECDEB57E32 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='30914C7C-6DDA-409D-BE74-DCECDEB57E32', @RelatedEntityNameFieldMap='TargetEntity';

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

/* SQL text to update entity field related entity name field map for entity field ID 05E0463C-130C-4B7C-8FC5-BF8C45640147 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='05E0463C-130C-4B7C-8FC5-BF8C45640147', @RelatedEntityNameFieldMap='Pipeline';

/* SQL text to update entity field related entity name field map for entity field ID 4E8A46A8-EF56-4D67-B161-B78E41941936 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4E8A46A8-EF56-4D67-B161-B78E41941936', @RelatedEntityNameFieldMap='TargetEntity';

/* SQL text to update entity field related entity name field map for entity field ID 4A774655-5497-4DEA-9ABC-694AEF5EE8E3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4A774655-5497-4DEA-9ABC-694AEF5EE8E3', @RelatedEntityNameFieldMap='Algorithm';

/* SQL text to update entity field related entity name field map for entity field ID 51E9A55B-D490-41B7-B4F3-2B429E18C71D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='51E9A55B-D490-41B7-B4F3-2B429E18C71D', @RelatedEntityNameFieldMap='Algorithm';

/* SQL text to update entity field related entity name field map for entity field ID 3BB4400A-0FE5-44F1-B565-4D0E69821D64 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3BB4400A-0FE5-44F1-B565-4D0E69821D64', @RelatedEntityNameFieldMap='Algorithm';

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

/* SQL text to update entity field related entity name field map for entity field ID EA625A1A-7553-41BD-9CF5-74BC41B541C7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EA625A1A-7553-41BD-9CF5-74BC41B541C7', @RelatedEntityNameFieldMap='ArtifactFile';

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

/* Index for Foreign Keys for OpenApp */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InstalledByUserID in table OpenApp
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenApp]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID ON [${flyway:defaultSchema}].[OpenApp] ([InstalledByUserID]);

/* Base View SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: vwOpenApps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Open Apps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OpenApp
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOpenApps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOpenApps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOpenApps]
AS
SELECT
    o.*,
    MJUser_InstalledByUserID.[Name] AS [InstalledByUser]
FROM
    [${flyway:defaultSchema}].[OpenApp] AS o
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_InstalledByUserID
  ON
    [o].[InstalledByUserID] = MJUser_InstalledByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenApps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: Permissions for vwOpenApps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenApps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spCreateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOpenApp]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(64),
    @DisplayName nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Version nvarchar(50),
    @Publisher nvarchar(200),
    @PublisherEmail_Clear bit = 0,
    @PublisherEmail nvarchar(255) = NULL,
    @PublisherURL_Clear bit = 0,
    @PublisherURL nvarchar(500) = NULL,
    @RepositoryURL nvarchar(500),
    @SchemaName_Clear bit = 0,
    @SchemaName nvarchar(128) = NULL,
    @MJVersionRange nvarchar(100),
    @License_Clear bit = 0,
    @License nvarchar(50) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(20) = NULL,
    @ManifestJSON nvarchar(MAX),
    @ConfigurationSchemaJSON_Clear bit = 0,
    @ConfigurationSchemaJSON nvarchar(MAX) = NULL,
    @InstalledByUserID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @Subpath_Clear bit = 0,
    @Subpath nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OpenApp]
            (
                [ID],
                [Name],
                [DisplayName],
                [Description],
                [Version],
                [Publisher],
                [PublisherEmail],
                [PublisherURL],
                [RepositoryURL],
                [SchemaName],
                [MJVersionRange],
                [License],
                [Icon],
                [Color],
                [ManifestJSON],
                [ConfigurationSchemaJSON],
                [InstalledByUserID],
                [Status],
                [Subpath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @DisplayName,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Version,
                @Publisher,
                CASE WHEN @PublisherEmail_Clear = 1 THEN NULL ELSE ISNULL(@PublisherEmail, NULL) END,
                CASE WHEN @PublisherURL_Clear = 1 THEN NULL ELSE ISNULL(@PublisherURL, NULL) END,
                @RepositoryURL,
                CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, NULL) END,
                @MJVersionRange,
                CASE WHEN @License_Clear = 1 THEN NULL ELSE ISNULL(@License, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                @ManifestJSON,
                CASE WHEN @ConfigurationSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationSchemaJSON, NULL) END,
                @InstalledByUserID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OpenApp]
            (
                [Name],
                [DisplayName],
                [Description],
                [Version],
                [Publisher],
                [PublisherEmail],
                [PublisherURL],
                [RepositoryURL],
                [SchemaName],
                [MJVersionRange],
                [License],
                [Icon],
                [Color],
                [ManifestJSON],
                [ConfigurationSchemaJSON],
                [InstalledByUserID],
                [Status],
                [Subpath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @DisplayName,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Version,
                @Publisher,
                CASE WHEN @PublisherEmail_Clear = 1 THEN NULL ELSE ISNULL(@PublisherEmail, NULL) END,
                CASE WHEN @PublisherURL_Clear = 1 THEN NULL ELSE ISNULL(@PublisherURL, NULL) END,
                @RepositoryURL,
                CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, NULL) END,
                @MJVersionRange,
                CASE WHEN @License_Clear = 1 THEN NULL ELSE ISNULL(@License, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                @ManifestJSON,
                CASE WHEN @ConfigurationSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationSchemaJSON, NULL) END,
                @InstalledByUserID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spUpdateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp]
    @ID uniqueidentifier,
    @Name nvarchar(64) = NULL,
    @DisplayName nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Version nvarchar(50) = NULL,
    @Publisher nvarchar(200) = NULL,
    @PublisherEmail_Clear bit = 0,
    @PublisherEmail nvarchar(255) = NULL,
    @PublisherURL_Clear bit = 0,
    @PublisherURL nvarchar(500) = NULL,
    @RepositoryURL nvarchar(500) = NULL,
    @SchemaName_Clear bit = 0,
    @SchemaName nvarchar(128) = NULL,
    @MJVersionRange nvarchar(100) = NULL,
    @License_Clear bit = 0,
    @License nvarchar(50) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(20) = NULL,
    @ManifestJSON nvarchar(MAX) = NULL,
    @ConfigurationSchemaJSON_Clear bit = 0,
    @ConfigurationSchemaJSON nvarchar(MAX) = NULL,
    @InstalledByUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @Subpath_Clear bit = 0,
    @Subpath nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenApp]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [DisplayName] = ISNULL(@DisplayName, [DisplayName]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Version] = ISNULL(@Version, [Version]),
        [Publisher] = ISNULL(@Publisher, [Publisher]),
        [PublisherEmail] = CASE WHEN @PublisherEmail_Clear = 1 THEN NULL ELSE ISNULL(@PublisherEmail, [PublisherEmail]) END,
        [PublisherURL] = CASE WHEN @PublisherURL_Clear = 1 THEN NULL ELSE ISNULL(@PublisherURL, [PublisherURL]) END,
        [RepositoryURL] = ISNULL(@RepositoryURL, [RepositoryURL]),
        [SchemaName] = CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, [SchemaName]) END,
        [MJVersionRange] = ISNULL(@MJVersionRange, [MJVersionRange]),
        [License] = CASE WHEN @License_Clear = 1 THEN NULL ELSE ISNULL(@License, [License]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [Color] = CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, [Color]) END,
        [ManifestJSON] = ISNULL(@ManifestJSON, [ManifestJSON]),
        [ConfigurationSchemaJSON] = CASE WHEN @ConfigurationSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationSchemaJSON, [ConfigurationSchemaJSON]) END,
        [InstalledByUserID] = ISNULL(@InstalledByUserID, [InstalledByUserID]),
        [Status] = ISNULL(@Status, [Status]),
        [Subpath] = CASE WHEN @Subpath_Clear = 1 THEN NULL ELSE ISNULL(@Subpath, [Subpath]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOpenApps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenApp] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OpenApp table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOpenApp]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOpenApp];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOpenApp
ON [${flyway:defaultSchema}].[OpenApp]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenApp]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OpenApp] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spDeleteOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenApp]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OpenApp]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenApp] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenApp] TO [cdp_Developer], [cdp_Integration];

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef4d3a91-623e-429d-a5bb-0dc24474299a' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'ExperimentSession')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ef4d3a91-623e-429d-a5bb-0dc24474299a',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '601df784-0f34-4980-97b6-3f210c2109c1' OR (EntityID = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND Name = 'AIAgentRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '601df784-0f34-4980-97b6-3f210c2109c1',
            'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', -- Entity: MJ: Experiment Session Iterations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b9cd9ec-1fbd-41d8-afd9-75d662a87e2d' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'RecordProcess')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0b9cd9ec-1fbd-41d8-afd9-75d662a87e2d',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8e4d5589-ec14-4384-a75d-101b3e326696' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'TargetEntity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8e4d5589-ec14-4384-a75d-101b3e326696',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c939b88-8a7f-49c5-9567-9e04c7c656dc' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'Pipeline')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3c939b88-8a7f-49c5-9567-9e04c7c656dc',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e01ba18e-8697-4ecc-9437-f567dac85155' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'Algorithm')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e01ba18e-8697-4ecc-9437-f567dac85155',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc2f1f3a-c245-4f04-a91a-ce591d787b8f' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Pipeline')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cc2f1f3a-c245-4f04-a91a-ce591d787b8f',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f71b8b3b-b969-45e0-a998-ae7c1dc8b9cd' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Algorithm')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f71b8b3b-b969-45e0-a998-ae7c1dc8b9cd',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0384067b-48d7-4a83-9e14-c776dca57ea7' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactFile')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0384067b-48d7-4a83-9e14-c776dca57ea7',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8bc27dc-3de0-49e3-963d-27d3722946da' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'TargetEntity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b8bc27dc-3de0-49e3-963d-27d3722946da',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a40bac8-db50-418f-9422-e24c1935e0da' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'Algorithm')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9a40bac8-db50-418f-9422-e24c1935e0da',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe8bc7c2-394b-43d1-bafa-4ceab34ff4a1' OR (EntityID = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND Name = 'MLAlgorithm')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fe8bc7c2-394b-43d1-bafa-4ceab34ff4a1',
            '05136FE9-994B-4C0F-926E-DEE4D8D928C1', -- Entity: MJ: ML Algorithm Use Case Rankings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3db32dd8-2743-4629-a8f9-5478e401591c' OR (EntityID = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND Name = 'MLAlgorithmUseCase')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3db32dd8-2743-4629-a8f9-5478e401591c',
            '05136FE9-994B-4C0F-926E-DEE4D8D928C1', -- Entity: MJ: ML Algorithm Use Case Rankings
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73eb55b9-ac04-43f9-9db5-5114d4154de4' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = 'Experiment')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '73eb55b9-ac04-43f9-9db5-5114d4154de4',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0104ac74-5c9a-415d-b1d2-fc3e64f26e08' OR (EntityID = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND Name = 'AgentRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0104ac74-5c9a-415d-b1d2-fc3e64f26e08',
            '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', -- Entity: MJ: Experiment Sessions
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1597CD31-A1D4-4447-BE0D-C72DCD2E3874'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A5F38DB5-011D-41FE-96E8-D5D2BAEB9150'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '65776A4C-7173-40F8-AEA8-6E5E24AC7227'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1597CD31-A1D4-4447-BE0D-C72DCD2E3874'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A5F38DB5-011D-41FE-96E8-D5D2BAEB9150'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '15D6E08F-EB42-4CDC-B89B-80C63283CC8F'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'A5F38DB5-011D-41FE-96E8-D5D2BAEB9150'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '424B1239-76C8-4FA0-B825-5F959FE1806E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '69E1B728-8231-4181-AEAF-81F5C19C7042'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '27E04775-D00D-4D25-A076-4A6FF0205260'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'ABE2E189-4467-4E98-87C5-B209D656438B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BF1AC3D5-615D-4C91-AFF7-6A9C88BC6D26'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '27E04775-D00D-4D25-A076-4A6FF0205260'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BF1AC3D5-615D-4C91-AFF7-6A9C88BC6D26'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '6AC413DC-EBE1-4DFC-9BE4-8E44377B7F46'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'BF1AC3D5-615D-4C91-AFF7-6A9C88BC6D26'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = 'AC4A2799-454B-4395-AA56-A42241F32C12'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '24DD5079-7579-4792-BD72-CD6DB2DB0ED0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BAF736AC-D4C5-4021-BB99-B630122215A5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '73EB55B9-AC04-43F9-9DB5-5114D4154DE4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0104AC74-5C9A-415D-B1D2-FC3E64F26E08'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '24DD5079-7579-4792-BD72-CD6DB2DB0ED0'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '73EB55B9-AC04-43F9-9DB5-5114D4154DE4'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0104AC74-5C9A-415D-B1D2-FC3E64F26E08'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '24DD5079-7579-4792-BD72-CD6DB2DB0ED0'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'AF18F28E-58EF-4CFD-BA8E-B7C8D7A80F79'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DC54B44D-79AC-4C91-9760-A2A91E708E7A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AF18F28E-58EF-4CFD-BA8E-B7C8D7A80F79'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6489A16D-9C97-4415-9D41-104732933D72'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D8CBCDFC-F3D8-4ADC-89E3-BDBD893D9F3F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4BA87989-B7E1-4701-BDA0-5983B6D0D5E7'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C14C9AFF-AA11-4443-AB07-F054E984726C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AF18F28E-58EF-4CFD-BA8E-B7C8D7A80F79'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '235B3ECF-9FC7-40B3-A3E7-F63758B1AD44'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6B7F8CD9-0491-493A-8961-B5B1E268B12B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B8BC27DC-3DE0-49E3-963D-27D3722946DA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9A40BAC8-DB50-418F-9422-E24C1935E0DA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6B7F8CD9-0491-493A-8961-B5B1E268B12B'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B8BC27DC-3DE0-49E3-963D-27D3722946DA'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9A40BAC8-DB50-418F-9422-E24C1935E0DA'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0613E52B-3280-4209-9B85-0A0FEAC23CDA'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'B8BC27DC-3DE0-49E3-963D-27D3722946DA'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '9A40BAC8-DB50-418F-9422-E24C1935E0DA'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '6B7F8CD9-0491-493A-8961-B5B1E268B12B'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EF0182F4-7C41-41C0-9ED6-E6573601054A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5F5E830E-4B7C-4CF0-A493-23CC34CB9E44'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0D7F9649-8909-4601-86EE-BA48C5A95582'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EF0182F4-7C41-41C0-9ED6-E6573601054A'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5F5E830E-4B7C-4CF0-A493-23CC34CB9E44'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '43E65059-00A5-4847-A047-17B86F2E16C3'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'EF0182F4-7C41-41C0-9ED6-E6573601054A'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '5F5E830E-4B7C-4CF0-A493-23CC34CB9E44'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '780AAB1C-0740-4AED-83A7-DCBE8DA2C843'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CEB5DECC-6D27-48D4-9E81-0F4ABC6CF017'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '22352411-C09A-416A-8110-81215AB22047'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3C939B88-8A7F-49C5-9567-9E04C7C656DC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E01BA18E-8697-4ECC-9437-F567DAC85155'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '780AAB1C-0740-4AED-83A7-DCBE8DA2C843'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E7F45990-3456-4CD8-AD90-46BA864A60D2'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3C939B88-8A7F-49C5-9567-9E04C7C656DC'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E01BA18E-8697-4ECC-9437-F567DAC85155'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '3C939B88-8A7F-49C5-9567-9E04C7C656DC'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'E01BA18E-8697-4ECC-9437-F567DAC85155'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '780AAB1C-0740-4AED-83A7-DCBE8DA2C843'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3FFAB2E2-84AE-441A-8ACA-37BFCC40CDB6'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FE8BC7C2-394B-43D1-BAFA-4CEAB34FF4A1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3DB32DD8-2743-4629-A8F9-5478E401591C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE8BC7C2-394B-43D1-BAFA-4CEAB34FF4A1'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3DB32DD8-2743-4629-A8F9-5478E401591C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'FE8BC7C2-394B-43D1-BAFA-4CEAB34FF4A1'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '3DB32DD8-2743-4629-A8F9-5478E401591C'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B871A401-2AA4-4B5C-942E-6AFB401660C6'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '052AA3EF-9B41-44C7-AC90-F9039D30A625'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '94606151-4B72-423F-A494-E3230421752C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8B0C0799-D66A-48BA-987D-C32D477E2A28'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CC2F1F3A-C245-4F04-A91A-CE591D787B8F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '052AA3EF-9B41-44C7-AC90-F9039D30A625'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8B0C0799-D66A-48BA-987D-C32D477E2A28'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CC2F1F3A-C245-4F04-A91A-CE591D787B8F'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '8B0C0799-D66A-48BA-987D-C32D477E2A28'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'F9B34226-CEEC-43F1-BB7B-DB64448AC558'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F9B34226-CEEC-43F1-BB7B-DB64448AC558'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '919000EB-F5B2-495F-93F4-AE6D2A1AF119'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '390DCC0B-C014-4C34-A899-E574F3933890'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6CDA85F4-965E-4835-96EA-58182D12F375'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8E4D5589-EC14-4384-A75D-101B3E326696'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F9B34226-CEEC-43F1-BB7B-DB64448AC558'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '919000EB-F5B2-495F-93F4-AE6D2A1AF119'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8E4D5589-EC14-4384-A75D-101B3E326696'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '919000EB-F5B2-495F-93F4-AE6D2A1AF119'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: ML Algorithms.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EE985BC9-0A22-4ED4-93DC-236FDBDF77D9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Algorithm Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '15D6E08F-EB42-4CDC-B89B-80C63283CC8F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Algorithm Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E8FC4567-5CB4-4CCF-AADE-9B7DD38F3F43' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.ProblemTypes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Algorithm Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1597CD31-A1D4-4447-BE0D-C72DCD2E3874' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A5F38DB5-011D-41FE-96E8-D5D2BAEB9150' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.HyperparameterSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'A180CE96-0D60-4B85-8F93-B56D26374546' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.DefaultHyperparameters 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'F2B8E114-843E-4DD9-99BC-87D3D492EA9A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.SupportsFeatureImportance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capabilities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D3C4A5A5-54E3-4D70-B07A-F31E2F76A367' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capabilities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '65776A4C-7173-40F8-AEA8-6E5E24AC7227' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '68D8B8B2-145F-416C-AF88-3D83F85A76FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithms.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C47E0F6-FD2A-44D8-B53B-722D8C9F3939' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '26642380-432D-4527-85DD-FE7A96E57549';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('acdcb481-3195-4808-a1e2-6987b26b84ee', '26642380-432D-4527-85DD-FE7A96E57549', 'FieldCategoryInfo', '{"Algorithm Overview":{"icon":"fa fa-info-circle","description":"Basic identification and functional purpose of the machine learning algorithm"},"Execution Settings":{"icon":"fa fa-cogs","description":"Technical configuration, driver mapping, and hyperparameter definitions"},"Capabilities":{"icon":"fa fa-check-square","description":"Functional capabilities and lifecycle status of the algorithm"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking information"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3f43a6c2-e905-4df2-8a58-a9538dbf5d78', '26642380-432D-4527-85DD-FE7A96E57549', 'FieldCategoryIcons', '{"Algorithm Overview":"fa fa-info-circle","Execution Settings":"fa fa-cogs","Capabilities":"fa fa-check-square","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '26642380-432D-4527-85DD-FE7A96E57549';

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E2EFDD32-CA23-4B7B-994A-319C989828AD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ExperimentSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Experiment Session',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AFB257FF-2710-4482-8D64-A5FB2E6DC0A4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ExperimentSession 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Experiment Session Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EF4D3A91-623E-429D-A5BB-0DC24474299A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Iteration Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC54B44D-79AC-4C91-9760-A2A91E708E7A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Label 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Iteration Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AF18F28E-58EF-4CFD-BA8E-B7C8D7A80F79' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Iteration Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6489A16D-9C97-4415-9D41-104732933D72' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Rationale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Iteration Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C8E3BB7C-E0B6-49D5-9260-03368B09BD08' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Score 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8CBCDFC-F3D8-4ADC-89E3-BDBD893D9F3F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ComputeCost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4BA87989-B7E1-4701-BDA0-5983B6D0D5E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.TokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C14C9AFF-AA11-4443-AB07-F054E984726C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.AIAgentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Agent Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '19DF8613-9F36-43C6-9AC9-0147F6B6B41B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.AIAgentRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Agent Run Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '601DF784-0F34-4980-97B6-3F210C2109C1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BE6CA2B-2E93-4661-A6D1-991A36304591' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Session Iterations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3D67E4B4-C9F3-40A0-9AFD-53B34A6DF191' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-vial */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-vial', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('871214f3-7578-497c-9cb0-a248106a0c12', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', 'FieldCategoryInfo', '{"Session Context":{"icon":"fa fa-layer-group","description":"Information linking this iteration to its parent experiment session"},"Iteration Details":{"icon":"fa fa-info-circle","description":"Core descriptive and status information about the specific attempt"},"Performance Metrics":{"icon":"fa fa-chart-line","description":"Quantitative results and resource consumption data"},"Execution Context":{"icon":"fa fa-robot","description":"Details regarding the AI agent execution associated with this attempt"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b1b2eff5-bfd7-420e-86c7-354192a0d481', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', 'FieldCategoryIcons', '{"Session Context":"fa fa-layer-group","Iteration Details":"fa fa-info-circle","Performance Metrics":"fa fa-chart-line","Execution Context":"fa fa-robot","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38';

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E458ADCB-FCCC-4074-A5CE-8D58D3FF8241' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0613E52B-3280-4209-9B85-0A0FEAC23CDA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A9A161A-61BE-4D2C-B603-675D7572C6CB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Version 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '235B3ECF-9FC7-40B3-A3E7-F63758B1AD44' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B7F8CD9-0491-493A-8961-B5B1E268B12B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.TargetEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '30914C7C-6DDA-409D-BE74-DCECDEB57E32' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.TargetEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B8BC27DC-3DE0-49E3-963D-27D3722946DA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.TargetVariable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '936424AB-347E-4E58-89D3-CD93E1A17B49' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.ProblemType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E245EF88-64A1-4F22-A954-EC44A431CE3E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.AlgorithmID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3BB4400A-0FE5-44F1-B565-4D0E69821D64' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Algorithm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9A40BAC8-DB50-418F-9422-E24C1935E0DA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.Hyperparameters 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '887A5948-0F5E-4E3D-824C-C1D4B636B761' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.SourceBindings 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'F9CC6E74-1E94-4D15-97D8-FACED9B94433' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.FeatureSteps 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '39701B36-19A8-45E5-B279-3A081EC3E5B0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.AsOfStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B66D28B9-757F-45C2-A14D-BD2167627BFF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.LeakageGuard 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Safety',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B902F42B-3518-432A-8700-2C32E06704B3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.ValidationStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Safety',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '8A15D518-D028-4596-8124-9485865074A8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7BE270EF-BCB8-4354-A780-2820C12C38E5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D82F95F-E227-4E90-B639-D001EE32A283' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '703FD109-331B-438D-902B-8E4A93C3F6AA';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2228a3a0-4594-41f6-b2ef-b62b17f55f1e', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'FieldCategoryInfo', '{"Pipeline Overview":{"icon":"fa fa-info-circle","description":"General identification and status of the ML pipeline"},"Model Definition":{"icon":"fa fa-brain","description":"Core modeling parameters including target variables and algorithms"},"Configuration":{"icon":"fa fa-sliders-h","description":"Technical configuration for data binding, feature engineering, and tuning"},"Validation and Safety":{"icon":"fa fa-shield-alt","description":"Strategies for model validation and leakage prevention"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6502aefc-82a3-4b13-ace7-ad898e8beae9', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'FieldCategoryIcons', '{"Pipeline Overview":"fa fa-info-circle","Model Definition":"fa fa-brain","Configuration":"fa fa-sliders-h","Validation and Safety":"fa fa-shield-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '703FD109-331B-438D-902B-8E4A93C3F6AA';

/* Set categories for 18 fields */

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7FFD262B-18E6-449B-B103-EF59F59C317C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.PipelineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Pipeline',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '05E0463C-130C-4B7C-8FC5-BF8C45640147' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.Pipeline 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Pipeline Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C939B88-8A7F-49C5-9567-9E04C7C656DC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ExperimentSessionIterationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Experiment Iteration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '657C631B-A990-4F3A-A881-8A06BAB643D4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.AlgorithmID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Algorithm',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A774655-5497-4DEA-9ABC-694AEF5EE8E3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.Algorithm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Algorithm Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E01BA18E-8697-4ECC-9437-F567DAC85155' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.FeaturesUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'BE952DA9-141A-4DC0-BFD9-DDFD414CCC59' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.Hyperparameters 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '740AE4C7-6ED5-41E6-9AF4-9E91F347FC48' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ValidationResults 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'C61AB0ED-A92C-4FCD-851F-2E778995C89F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ResultingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resulting Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '237CF3C4-7600-4C67-A368-73B9830FF3C2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '780AAB1C-0740-4AED-83A7-DCBE8DA2C843' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CEB5DECC-6D27-48D4-9E81-0F4ABC6CF017' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF11DBF7-C050-463B-87D4-9F2DC23CDACB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ComputeCost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resource Usage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '22352411-C09A-416A-8110-81215AB22047' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.TokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resource Usage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A05882F-6969-41EE-91A4-8606BFF23A8E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E7F45990-3456-4CD8-AD90-46BA864A60D2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0664DDD3-ED18-44BE-A6A4-167959719288' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Training Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '02798AFD-669B-4C7D-B4A5-7D61100A3F75' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-microchip */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-microchip', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('d2c4b1bb-2813-465f-8240-203dbec53320', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'FieldCategoryInfo', '{"Execution Context":{"icon":"fa fa-project-diagram","description":"Links to pipelines, sessions, and parent iterations for the training run."},"Model Configuration":{"icon":"fa fa-cogs","description":"Details on the algorithm, features, and hyperparameters used."},"Performance Metrics":{"icon":"fa fa-chart-bar","description":"Validation results and references to resulting models."},"Execution Timeline":{"icon":"fa fa-clock","description":"Run status, timestamps, and observational notes."},"Resource Usage":{"icon":"fa fa-dollar-sign","description":"Financial and compute resource consumption metrics."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('154e9089-6fbb-4abe-9009-b1127e55780b', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'FieldCategoryIcons', '{"Execution Context":"fa fa-project-diagram","Model Configuration":"fa fa-cogs","Performance Metrics":"fa fa-chart-bar","Execution Timeline":"fa fa-clock","Resource Usage":"fa fa-dollar-sign","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2';

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Open Apps.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7655DE67-050C-4FEC-833F-3B3FE61E2451' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'App Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6AC413DC-EBE1-4DFC-9BE4-8E44377B7F46' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27E04775-D00D-4D25-A076-4A6FF0205260' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3849DB2D-73C2-46BF-B263-AF66D6A0B34D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Version 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ABE2E189-4467-4E98-87C5-B209D656438B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Publisher 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BF1AC3D5-615D-4C91-AFF7-6A9C88BC6D26' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.PublisherEmail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '0F40CC6A-B28A-4B49-AF23-BEFE1B9907D3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.PublisherURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'F099ED4E-387C-4F5E-87A7-5272516719D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.RepositoryURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '132CF4B3-E5E5-4083-B91D-1A629352872B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.SchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8A2781A-95C0-4335-81B6-0021B7078E06' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.MJVersionRange 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A1465DB-2055-46AB-93D8-A70DD2245102' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.License 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8721CEB2-E802-4C49-BBFC-BF6AEB51544B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'UI Branding',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '19CD1851-4DA5-43E7-BCE7-175F1248EB26' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Color 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'UI Branding',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8A25DC2-66A9-4338-8CD5-C169F940372E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.ManifestJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Manifest',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B37C9605-C957-4A09-ACC6-2862C1A86D67' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.ConfigurationSchemaJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Configuration Schema',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '519A5582-4618-4138-B19C-1713064CC457' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.InstalledByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A47E36F4-7942-4A8B-9735-72F74B07C618' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8416B44A-1A4D-4D48-AC1F-5831D14DFA12' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12A25C96-E439-471A-AB5D-E190A3FFC957' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.Subpath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '762C8803-FB39-4E24-B92F-4F18241256E1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Open Apps.InstalledByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'App Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC2D5658-7CAD-45CA-BCC5-A87E70144545' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-box-open */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-box-open', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'AC4A2799-454B-4395-AA56-A42241F32C12';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('54136050-5b9b-4d97-ba50-f94fd7d7b5f7', 'AC4A2799-454B-4395-AA56-A42241F32C12', 'FieldCategoryInfo', '{"App Identity":{"icon":"fa fa-info-circle","description":"Core identifying information including name, description, and source repository"},"App Lifecycle":{"icon":"fa fa-sync-alt","description":"Information regarding versioning, installation status, and compatibility"},"Publisher Information":{"icon":"fa fa-user-tie","description":"Contact and organizational details for the application publisher"},"App Configuration":{"icon":"fa fa-cogs","description":"Technical configuration, database schema, and manifest settings"},"UI Branding":{"icon":"fa fa-palette","description":"Visual branding elements for displaying the app in the UI"},"System Metadata":{"icon":"fa fa-database","description":"Audit and system tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3e4baca8-27d7-48fe-8458-fcc7cb9dd719', 'AC4A2799-454B-4395-AA56-A42241F32C12', 'FieldCategoryIcons', '{"App Identity":"fa fa-info-circle","App Lifecycle":"fa fa-sync-alt","Publisher Information":"fa fa-user-tie","App Configuration":"fa fa-cogs","UI Branding":"fa fa-palette","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7D136B5A-CC4A-4355-B266-0F5DCAFE2851' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithmID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5443C622-F023-45C0-995B-E765B728A075' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithmUseCaseID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8BB6B63D-0C44-421D-B845-3C44365EC788' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE8BC7C2-394B-43D1-BAFA-4CEAB34FF4A1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithmUseCase 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3DB32DD8-2743-4629-A8F9-5478E401591C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.SuitabilityScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ranking Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FFAB2E2-84AE-441A-8ACA-37BFCC40CDB6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.RecommendationLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ranking Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.Rationale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ranking Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F7134E3-ACBE-49F4-8A9F-71FC04D10039' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2C294AD9-D593-41E0-AFA7-AC21BFFDE5E9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D085176-5132-4E19-A109-E1F963509374' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '05136FE9-994B-4C0F-926E-DEE4D8D928C1';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('091ab61c-de31-4431-863f-5e8f54a2861e', '05136FE9-994B-4C0F-926E-DEE4D8D928C1', 'FieldCategoryInfo', '{"Use Case Mapping":{"icon":"fa fa-project-diagram","description":"Relationships and associations between ML algorithms and their target use cases"},"Ranking Details":{"icon":"fa fa-star","description":"Suitability scores, recommendation levels, and plain-language rationale for the ranking"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit logs and unique identifiers"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8a1a64b7-34a8-4f43-a058-4239f3d6a4a3', '05136FE9-994B-4C0F-926E-DEE4D8D928C1', 'FieldCategoryIcons', '{"Use Case Mapping":"fa fa-project-diagram","Ranking Details":"fa fa-star","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '05136FE9-994B-4C0F-926E-DEE4D8D928C1';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6D980809-164F-4F29-B360-BCF4FBECB882' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '69E1B728-8231-4181-AEAF-81F5C19C7042' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51ACBD01-9BD3-43A2-9562-C4C338DC5B18' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.ProblemTypeScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.Guidance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E4A0A11D-2953-42FE-B5F3-DA0B2ECCA343' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.DisplayOrder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Use Case Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '424B1239-76C8-4FA0-B825-5F959FE1806E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1E42A7A-D9E2-4763-BBAF-94A730936CAC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '66AE2491-E621-40BC-B500-B2A0E053F820' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('36855eb0-6627-4162-a9c3-c29d49de06d2', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', 'FieldCategoryInfo', '{"Use Case Details":{"icon":"fa fa-clipboard-list","description":"Core details, scope, and guidance for the machine learning use case scenario."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a4cf7823-6a61-4986-bd08-da61bcc4e022', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', 'FieldCategoryIcons', '{"Use Case Details":"fa fa-clipboard-list","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Experiments.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3729481-FE28-4891-9C14-C5A21DAE93C8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '43E65059-00A5-4847-A047-17B86F2E16C3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '99B71188-3D89-46A1-AF2C-0C61BDBFBD9F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.ExperimentType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EF0182F4-7C41-41C0-9ED6-E6573601054A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Experiment Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D7F9649-8909-4601-86EE-BA48C5A95582' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.Goal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Objectives & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DDE443F0-F51E-401D-92BC-0B49A00F578F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.TargetMetric 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Objectives & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F5E830E-4B7C-4CF0-A493-23CC34CB9E44' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.PlanSpecTemplate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Objectives & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '7FC84CB6-0A55-4537-8B41-3BBDDA2CD9A2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F55B3283-D82A-4A0E-A4F9-0C937EE114A1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiments.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2FC3ADD0-BD34-4F92-BB62-4D0278BCB8E5' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-flask */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-flask', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '232793CF-4406-4BCC-8022-0589C6EA6EF3';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('aeecb583-e6d6-4d35-ab15-109c4a83f4cf', '232793CF-4406-4BCC-8022-0589C6EA6EF3', 'FieldCategoryInfo', '{"Experiment Profile":{"icon":"fa fa-flask","description":"Basic identification, description, type, and current status of the experiment."},"Objectives & Configuration":{"icon":"fa fa-bullseye","description":"The goals, target metrics, and configuration templates defining the experiment''s execution."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ada0dd18-364d-49f0-b1e4-90ef3610e983', '232793CF-4406-4BCC-8022-0589C6EA6EF3', 'FieldCategoryIcons', '{"Experiment Profile":"fa fa-flask","Objectives & Configuration":"fa fa-bullseye","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '232793CF-4406-4BCC-8022-0589C6EA6EF3';

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D00F5797-AC83-4398-B3E3-D4B30E925AAE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.ExperimentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Experiment',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5329588B-49B4-49A6-A0DC-300E9490ED00' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '49D424DF-5006-49FF-BF6C-1FE96B65EBF3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Goal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Goal Override',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5ED3427-B34F-42A1-A513-F6953EA9D0C6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '24DD5079-7579-4792-BD72-CD6DB2DB0ED0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Experiment 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Experiment Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '73EB55B9-AC04-43F9-9DB5-5114D4154DE4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Budget 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Performance',
   GeneratedFormSection = 'Category',
   DisplayName = 'Budget Constraints',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '7672A82D-9F28-4805-8F9E-1A60516C7C4E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.PlanSpec 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Performance',
   GeneratedFormSection = 'Category',
   DisplayName = 'Plan Specification',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '4EBC06E3-72D5-4F59-9650-8047A8E45946' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.Leaderboard 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Performance',
   GeneratedFormSection = 'Category',
   DisplayName = 'Leaderboard Snapshot',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '8FA23ED8-71E9-44B5-BB8F-762B07E72B8B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.AgentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Performance',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E47F4D6-4653-41A8-BCD7-024FC9FC4280' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.AgentRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution & Performance',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Run Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0104AC74-5C9A-415D-B1D2-FC3E64F26E08' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BAF736AC-D4C5-4021-BB99-B630122215A5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Experiment Sessions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A43E613-D18D-4BC4-A611-219F16F3739C' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-flask */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-flask', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('fbeb1bdd-8225-4759-9d5f-374112fef384', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', 'FieldCategoryInfo', '{"Session Details":{"icon":"fa fa-flask","description":"Core identity, goal, and status of the experiment session execution"},"Execution & Performance":{"icon":"fa fa-play-circle","description":"Execution parameters, budget constraints, agent run details, and performance leaderboards"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('23a01545-adc9-476a-aa4a-79f88ce36eda', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', 'FieldCategoryIcons', '{"Session Details":"fa fa-flask","Execution & Performance":"fa fa-play-circle","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198';

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7D63C521-60A5-466F-A13F-E3B237CFB56D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.MLModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '86FD001C-52E7-4A71-A475-F5C4878B7CC4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.RecordProcessID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CD2474E9-3F84-4E48-844F-9F4C59079FF7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.RecordProcess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0B9CD9EC-1FBD-41D8-AFD9-75D662A87E2D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.Mode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scoring Mode',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '919000EB-F5B2-495F-93F4-AE6D2A1AF119' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.TargetEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Destination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4E8A46A8-EF56-4D67-B161-B78E41941936' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.TargetEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Destination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E4D5589-EC14-4384-A75D-101B3E326696' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.TargetColumn 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Destination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F9B34226-CEEC-43F1-BB7B-DB64448AC558' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.MaterializedResultID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Destination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B041E1BE-CC53-43D5-B446-AB7BF72FED60' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.LastScoredAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '390DCC0B-C014-4C34-A899-E574F3933890' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.LastRowCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6CDA85F4-965E-4835-96EA-58182D12F375' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '29AE7DD0-460A-4E82-B651-F940129346CE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A9D4E337-04C5-4E30-83C6-62B03D8E9343' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'FD8EF230-65F3-496D-A117-7610572C35AA';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0387472d-ed3f-4ac4-8199-419bc092eeed', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'FieldCategoryInfo', '{"Binding Configuration":{"icon":"fa fa-sliders-h","description":"Settings defining the ML model, process, and scoring mode"},"Target Destination":{"icon":"fa fa-bullseye","description":"The destination entity and column where model predictions are written"},"Execution Metrics":{"icon":"fa fa-tachometer-alt","description":"Performance and execution statistics from the latest scoring run"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('f92e21a0-c246-459e-add0-f0b77c95bb4a', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'FieldCategoryIcons', '{"Binding Configuration":"fa fa-sliders-h","Target Destination":"fa fa-bullseye","Execution Metrics":"fa fa-tachometer-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA';

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: ML Models.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '759D131A-7DF7-4B85-9E0C-6DB3BFC61084' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.PipelineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CECBE6BF-4A2B-4D9B-9135-F372777ED18E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Pipeline 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC2F1F3A-C245-4F04-A91A-CE591D787B8F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Version 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B871A401-2AA4-4B5C-942E-6AFB401660C6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.AlgorithmID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51E9A55B-D490-41B7-B4F3-2B429E18C71D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Algorithm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F71B8B3B-B969-45E0-A998-AE7C1DC8B9CD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactFileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EA625A1A-7553-41BD-9CF5-74BC41B541C7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactFile 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0384067B-48D7-4A83-9E14-C776DCA57EA7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Lineage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Lineage Details',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '91EEBC4E-4A98-4B20-BA7B-AA9F82C61BC1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B0C0799-D66A-48BA-987D-C32D477E2A28' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.ProblemType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.TargetVariable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '052AA3EF-9B41-44C7-AC90-F9039D30A625' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.FeatureSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '0BB4B332-DE18-488A-B841-6C8BBAC3BD9C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.FittedPreprocessing 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B17A1F8F-FC2D-4C5B-8E89-FCD67605EF49' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.TrainedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '94606151-4B72-423F-A494-E3230421752C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingDurationSec 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Duration (Seconds)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1065C3B7-CED6-4EED-A179-9FC98C8E9CDB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingRowCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A33BE812-E208-4410-8523-DA31277508C4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.Metrics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Metrics',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'DD008101-49C0-4F82-852D-963B77F096A8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.HoldoutMetrics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'EB2B1A50-0126-4374-88FA-D562C500DA8E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.FeatureImportance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '86F10CE5-E0A9-47E5-8DD5-DC83D1A9622F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AED32800-6560-42F3-A8D3-06801C80476C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Models.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BBA8940E-120A-4D50-A75D-7B598783F02B' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('73550565-f5fe-463d-90f4-49d56c5ee74d', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'FieldCategoryInfo', '{"Model Identity & Status":{"icon":"fa fa-tag","description":"Core model identifiers, versioning, lineage, and lifecycle status."},"Schema & Configuration":{"icon":"fa fa-sliders-h","description":"Input schemas, target variables, and fitted preprocessing parameters."},"Training & Performance":{"icon":"fa fa-chart-line","description":"Training execution details, validation metrics, and feature importances."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c0a09c65-019e-4747-a954-13fb72845ba4', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'FieldCategoryIcons', '{"Model Identity & Status":"fa fa-tag","Schema & Configuration":"fa fa-sliders-h","Training & Performance":"fa fa-chart-line","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B';

/* Generated Validation Functions for MJ: ML Algorithm Use Case Rankings */
-- CHECK constraint for MJ: ML Algorithm Use Case Rankings: Field: SuitabilityScore was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([SuitabilityScore]>=(1) AND [SuitabilityScore]<=(5))', 'public ValidateSuitabilityScoreRange(result: ValidationResult) {
	if (this.SuitabilityScore < 1 || this.SuitabilityScore > 5) {
		result.Errors.push(new ValidationErrorInfo(
			"SuitabilityScore",
			"Suitability score must be between 1 and 5.",
			this.SuitabilityScore,
			ValidationErrorType.Failure
		));
	}
}', 'The suitability score must be a value between 1 and 5, inclusive.', 'ValidateSuitabilityScoreRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '3FFAB2E2-84AE-441A-8ACA-37BFCC40CDB6');

