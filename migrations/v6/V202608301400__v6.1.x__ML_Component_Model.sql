/**************************************************************************************************
 * Migration: Predictive Studio — typed ML component model (schema)
 *
 * "Everything is a component": a model decomposes into typed, pluggable/fillable components —
 * base model primitives, preprocessing, statistical methods, inputs/outputs, parameters, and
 * structures (bagging/boosting/stacking wrappers with slots). Components need not be trainable to
 * be first-class (a hand-authored matrix or an operator-weighted rubric is one), each carries
 * meaning (a prose Story + embedding vector), and instances bind to real MJ entities/fields so
 * inputs, outputs and parameters make business sense, not just mathematical sense.
 *
 * Tables created (FK order):
 *   1. MLComponentType          (MJ: ML Component Types)           - catalog node in the INHERITANCE tree (ParentID)
 *   2. MLComponentTypeProperty  (MJ: ML Component Type Properties) - inheritable lists as rows (banks, gates, defaults)
 *   3. MLComponentTypeSlot      (MJ: ML Component Type Slots)      - fillable positions a type declares
 *   4. MLComponent              (MJ: ML Components)                - a filled/trained instance in one model's COMPOSITION
 *                                                                     tree (ParentComponentID), or standalone reusable
 *   5. MLComponentBinding       (MJ: ML Component Bindings)        - instance I/O/params ↔ MJ: Entities / Entity Fields
 *
 * Existing tables extended (all additive, nullable — published rows keep working unchanged):
 *   - MLAlgorithm.ComponentTypeID          bridge: each catalog algorithm points at its leaf type
 *   - MLTrainingPipeline.ComponentGraph    declarative component graph (NULL ⇒ today's AlgorithmID path)
 *   - MLTrainingPipeline.DatedSources      persisted DatedSourceSpec[] — closes the as-of round-trip gap
 *                                          (assemble() never received datedSources, so as-of features
 *                                          could not travel train → Lineage → score)
 *   - MLModel.RootComponentID              the trained model's materialized instance-tree root
 *
 * The TYPE tree ("is-a", MLComponentType.ParentID) carries properties true of every descendant;
 * a leaf's full profile is resolved by walking up and merging per fixed per-key semantics (union /
 * append / override — see @memberjunction/predictive-studio-core component-resolution). The
 * INSTANCE tree ("part-of", MLComponent.ParentComponentID + SlotName) is one model's composition.
 *
 * Schema/DDL only. CodeGen generates the Entity/EntityField metadata, __mj_CreatedAt/__mj_UpdatedAt
 * columns, foreign-key indexes (IDX_AUTO_MJ_FKEY_*), views, and CRUD stored procedures after this
 * migration runs. The seed TREE (7 Kind roots → families → the 6 algorithm leaves, rubric, as-of
 * aggregates, normalizations, bands, …) is seeded via metadata sync (mj sync), not here.
 * PostgreSQL counterpart: deferred to the release build per migrations/CLAUDE.md (build-engineer
 * conversion of the whole release's DDL in one pass).
 *
 * Version: 6.1.x
 **************************************************************************************************/

-- ============================================================================
-- 1. MLComponentType (MJ: ML Component Types) — catalog node in the inheritance tree
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLComponentType] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ParentID] UNIQUEIDENTIFIER NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [Kind] NVARCHAR(20) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [Story] NVARCHAR(MAX) NULL,
    [StoryVector] NVARCHAR(MAX) NULL,
    [StoryEmbeddingModelID] UNIQUEIDENTIFIER NULL,
    [IsAbstract] BIT NOT NULL DEFAULT 0,
    [Trainable] BIT NOT NULL DEFAULT 0,
    [DriverClass] NVARCHAR(255) NULL,
    [SpecSchema] NVARCHAR(MAX) NULL,
    [DefaultSpec] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    [Version] INT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_MLComponentType] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MLComponentType_Name] UNIQUE ([Name]),
    CONSTRAINT [FK_MLComponentType_Parent] FOREIGN KEY ([ParentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponentType]([ID]),
    CONSTRAINT [FK_MLComponentType_StoryEmbeddingModel] FOREIGN KEY ([StoryEmbeddingModelID])
        REFERENCES ${flyway:defaultSchema}.[AIModel]([ID]),
    CONSTRAINT [CK_MLComponentType_Kind] CHECK ([Kind] IN ('Model', 'Preprocessing', 'Statistic', 'Input', 'Output', 'Parameter', 'Structure')),
    CONSTRAINT [CK_MLComponentType_Status] CHECK ([Status] IN ('Draft', 'Published', 'Deprecated'))
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A typed ML component in the catalog''s inheritance tree — the unit "everything is a component" decomposes a model into. Kind roots (ParentID NULL) partition the space: Model primitives (regression, boosting, rubric, HMM), Preprocessing, Statistic methods, Inputs, Outputs, Parameters (trained or hand-authored — a weighted rubric or hand-authored matrix is first-class without being trainable), and Structures (bagging/stacking wrappers whose slots accept other components). Each node holds only what is true of EVERY descendant; a leaf''s full profile is resolved by walking up the tree and merging the property rows per fixed per-key semantics. EXAMPLE: Model → Tree Ensemble → Boosting → XGBoost (DriverClass "xgboost").', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name, unique across the catalog (seed @lookup references resolve by it). E.g. "Glass-Box Rubric", "As-Of Aggregate", "Bagging Wrapper".', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which of the seven component spaces this node belongs to: Model, Preprocessing, Statistic, Input, Output, Parameter, or Structure. A child''s Kind always equals its parent''s (lint-enforced); the seven roots are the only ParentID-NULL rows.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'Kind';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this component IS, technically — the catalog description a human or agent reads first.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The archetype''s semantic identity in prose — the other half of a component''s dual identity ("an HMM models a sequence as transitions between hidden regimes"; "a rubric is a hand-weighted linear combination of normalized signals"). Instance-specific stories live on MJ: ML Components.Story.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'Story';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Embedding vector of Story (JSON float array), for similarity search over component meaning. Written by the entity server on save when Story changes.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'StoryVector';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1 this is an interior/family node (e.g. "Tree Ensemble") that organizes the tree and carries inherited properties but cannot be instantiated; leaves are concrete components. Lint: abstract ⇒ DriverClass NULL.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'IsAbstract';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1 the component can be FIT to data (an algorithm, a population-relative normalization). 0 is first-class, not lesser: a hand-authored matrix, an operator-weighted rubric in given mode, or a stateless curve mapping is reusable without training.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'Trainable';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Execution key for concrete leaves, interpreted by Kind: Model/Structure → the Python-sidecar estimator key ("xgboost", "rubric", "bagging"); Preprocessing → the sidecar preprocessing op ("minmax", "onehot"); Input → the FeatureStep kind or as-of aggregate key ("select", "asof_recency"); Statistic/Output → the TypeScript @RegisterClass key. NULL on abstract nodes.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'DriverClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON Schema an instance''s Spec must satisfy (hyperparameters for an algorithm leaf, window shape for an as-of aggregate, weight-set shape for a rubric). Drives UI forms, agent validation, and the server-side save gate.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'SpecSchema';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON default Spec applied when an instance does not override (mirrors MLAlgorithm.DefaultHyperparameters for algorithm leaves).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'DefaultSpec';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle: Draft (authored, not yet selectable — e.g. the Sequence/HMM subtree before the sequence problem type ships), Published (selectable), Deprecated.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Monotonic definition version, bumped when SpecSchema/DriverClass semantics change.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentType', @level2type=N'COLUMN', @level2name=N'Version';
GO

-- ============================================================================
-- 2. MLComponentTypeProperty (MJ: ML Component Type Properties) — inheritable lists as rows
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLComponentTypeProperty] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ComponentTypeID] UNIQUEIDENTIFIER NOT NULL,
    [PropertyKey] NVARCHAR(50) NOT NULL,
    [Operation] NVARCHAR(10) NOT NULL DEFAULT 'Add',
    [ItemKey] NVARCHAR(255) NULL,
    [Value] NVARCHAR(MAX) NOT NULL,
    [Sequence] INT NOT NULL DEFAULT 0,
    [Rationale] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_MLComponentTypeProperty] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MLComponentTypeProperty_ComponentType] FOREIGN KEY ([ComponentTypeID])
        REFERENCES ${flyway:defaultSchema}.[MLComponentType]([ID]),
    CONSTRAINT [CK_MLComponentTypeProperty_PropertyKey] CHECK ([PropertyKey] IN ('CompatibleProblemTypes', 'PreprocessingBank', 'HyperparameterBank', 'StatisticalGate', 'CompatibleSlotTypes', 'DefaultNormalization', 'GuidanceRationale', 'Explainability', 'MissingDataPolicy', 'ValidationDefaults', 'RequiredInputKinds')),
    CONSTRAINT [CK_MLComponentTypeProperty_Operation] CHECK ([Operation] IN ('Add', 'Remove', 'Replace'))
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One inheritable property item on a component-type node — the tree''s cargo, one row per list item rather than a JSON blob, so the "principled partition" is mechanically lintable (a Remove below an ancestor''s Add of the same ItemKey is a detectable contradiction: the property was NOT true of all descendants and should move down). A leaf''s effective profile = fold root→leaf applying each key''s fixed merge mode (union-with-veto for banks/gates, append/replace for hyperparameter banks and guidance, override-nearest for defaults, subset-narrowing for CompatibleProblemTypes). The banks are what "everything a model needs to be used well" means: preprocessing banks, hyperparameter banks, statistical gates a candidate must pass, default normalizations, guidance prose.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeProperty';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which inheritable list this row contributes to. CompatibleProblemTypes (narrowing set), PreprocessingBank / StatisticalGate / CompatibleSlotTypes / RequiredInputKinds (union, Remove vetoes), HyperparameterBank / GuidanceRationale (append order, Replace overrides by ItemKey), DefaultNormalization / Explainability / MissingDataPolicy (nearest-node override), ValidationDefaults (shallow object merge).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeProperty', @level2type=N'COLUMN', @level2name=N'PropertyKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Add contributes the item; Replace swaps the inherited item with the same ItemKey; Remove vetoes it for this subtree (legal, but the lint reports it as a partition smell — the ancestor claimed something not true of all descendants).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeProperty', @level2type=N'COLUMN', @level2name=N'Operation';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stable identity of the list item (a preprocessing op key, a gate name, a hyperparameter name) so Remove/Replace can target it across tree levels. NULL for single-valued keys.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeProperty', @level2type=N'COLUMN', @level2name=N'ItemKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON payload of the item (a GateSpec, a PreprocessingOp, a hyperparameter range, a guidance paragraph).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeProperty', @level2type=N'COLUMN', @level2name=N'Value';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Ordering within (ComponentTypeID, PropertyKey) for append-mode keys.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeProperty', @level2type=N'COLUMN', @level2name=N'Sequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Why this holds for every descendant of the node it sits on — the honesty test for placing a property at this height.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeProperty', @level2type=N'COLUMN', @level2name=N'Rationale';
GO

-- ============================================================================
-- 3. MLComponentTypeSlot (MJ: ML Component Type Slots) — fillable positions
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLComponentTypeSlot] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ComponentTypeID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [AcceptsComponentTypeID] UNIQUEIDENTIFIER NOT NULL,
    [MinCount] INT NOT NULL DEFAULT 1,
    [MaxCount] INT NULL,
    [DefaultComponentTypeID] UNIQUEIDENTIFIER NULL,
    [Sequence] INT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_MLComponentTypeSlot] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MLComponentTypeSlot] UNIQUE ([ComponentTypeID], [Name]),
    CONSTRAINT [FK_MLComponentTypeSlot_ComponentType] FOREIGN KEY ([ComponentTypeID])
        REFERENCES ${flyway:defaultSchema}.[MLComponentType]([ID]),
    CONSTRAINT [FK_MLComponentTypeSlot_Accepts] FOREIGN KEY ([AcceptsComponentTypeID])
        REFERENCES ${flyway:defaultSchema}.[MLComponentType]([ID]),
    CONSTRAINT [FK_MLComponentTypeSlot_Default] FOREIGN KEY ([DefaultComponentTypeID])
        REFERENCES ${flyway:defaultSchema}.[MLComponentType]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A fillable position a component type declares — what makes components pluggable. A Structure''s slots accept model components (a Bagging Wrapper''s base_estimator, a Stacking Wrapper''s estimators/final_estimator); a Glass-Box Rubric''s weights slot accepts a Parameter/Weight Set. A slot is filled by an MJ: ML Components row whose ParentComponentID points at the filler''s parent instance and whose SlotName names this slot. Slots inherit down the type tree (union by Name); a subtype may only NARROW AcceptsComponentTypeID to a descendant.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeSlot';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Slot name, unique per declaring type (e.g. "base_estimator", "estimators", "final_estimator", "weights", "bands").', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeSlot', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What the slot is for and how its fillers are used at fit/predict time.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeSlot', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Minimum fillers required for a valid instance (0 = optional slot).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeSlot', @level2type=N'COLUMN', @level2name=N'MinCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum fillers; NULL = unbounded (a stacking ensemble''s estimators).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeSlot', @level2type=N'COLUMN', @level2name=N'MaxCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Ordering of slots for display and positional serialization.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentTypeSlot', @level2type=N'COLUMN', @level2name=N'Sequence';
GO

-- ============================================================================
-- 4. MLComponent (MJ: ML Components) — a filled/trained instance, or standalone reusable
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLComponent] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ComponentTypeID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [MLModelID] UNIQUEIDENTIFIER NULL,
    [ParentComponentID] UNIQUEIDENTIFIER NULL,
    [SlotName] NVARCHAR(100) NULL,
    [Sequence] INT NOT NULL DEFAULT 0,
    [Spec] NVARCHAR(MAX) NULL,
    [FittedState] NVARCHAR(MAX) NULL,
    [ArtifactFileID] UNIQUEIDENTIFIER NULL,
    [IsTrained] BIT NOT NULL DEFAULT 0,
    [SourceComponentID] UNIQUEIDENTIFIER NULL,
    [ActionID] UNIQUEIDENTIFIER NULL,
    [PromotionState] NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    [Story] NVARCHAR(MAX) NULL,
    [StoryVector] NVARCHAR(MAX) NULL,
    [StoryEmbeddingModelID] UNIQUEIDENTIFIER NULL,
    [StoryContribution] NVARCHAR(MAX) NULL,
    [ContentHash] NVARCHAR(64) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    [Version] INT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_MLComponent] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MLComponent_ComponentType] FOREIGN KEY ([ComponentTypeID])
        REFERENCES ${flyway:defaultSchema}.[MLComponentType]([ID]),
    CONSTRAINT [FK_MLComponent_MLModel] FOREIGN KEY ([MLModelID])
        REFERENCES ${flyway:defaultSchema}.[MLModel]([ID]),
    CONSTRAINT [FK_MLComponent_Parent] FOREIGN KEY ([ParentComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]),
    CONSTRAINT [FK_MLComponent_Source] FOREIGN KEY ([SourceComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]),
    CONSTRAINT [FK_MLComponent_ArtifactFile] FOREIGN KEY ([ArtifactFileID])
        REFERENCES ${flyway:defaultSchema}.[File]([ID]),
    CONSTRAINT [FK_MLComponent_Action] FOREIGN KEY ([ActionID])
        REFERENCES ${flyway:defaultSchema}.[Action]([ID]),
    CONSTRAINT [FK_MLComponent_StoryEmbeddingModel] FOREIGN KEY ([StoryEmbeddingModelID])
        REFERENCES ${flyway:defaultSchema}.[AIModel]([ID]),
    CONSTRAINT [CK_MLComponent_PromotionState] CHECK ([PromotionState] IN ('Draft', 'InReview', 'Approved', 'Deprecated')),
    CONSTRAINT [CK_MLComponent_Status] CHECK ([Status] IN ('Draft', 'Validated', 'Published', 'Archived'))
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A component INSTANCE: a catalog type filled with a concrete Spec (weights chosen, window set, hyperparameters fixed) and, when trained, its own fitted state/artifact. Two lives: (1) inside one model''s composition tree — MLModelID set on the root, children hanging off ParentComponentID + SlotName; (2) standalone reusable (MLModelID NULL) — a hand-authored matrix, an approved code-feature, or a trained sub-component another model reuses by reference (SourceComponentID), saving training and meaningfully connecting models to each other and to the data. Carries the instance''s Story (what pattern THIS one captured, its contribution to the model''s story) — the tagging agent writes it at publish.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Instance name (e.g. "Renewal-risk rubric weights v2", "DaysSinceLastLogin recency, 90d rolling").', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional free-form description of the instance.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which slot of the parent instance this fills (matches an MJ: ML Component Type Slots.Name declared by the parent''s type). NULL on a composition root or a standalone component.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'SlotName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Order among siblings filling the same slot (positional ensembles).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Sequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON instance configuration, validated against the type''s SpecSchema at save (rubric weights + modes + caps, an as-of window, hyperparameters).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Spec';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON fitted parameters for THIS component alone (a standardize op''s mean/std, a rubric''s population stats) — the per-component slice of what travels with a model; the model-level FittedPreprocessing stays on MJ: ML Models.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'FittedState';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1 the component has been fit and its FittedState/ArtifactFileID are authoritative; reuse loads them frozen (fit is a no-op on a reused trained component).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'IsTrained';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle gate for components that execute code or move persisted scores — an Action-backed input must be Approved before it can affect a trained/served model (ported from Sonar''s Factor.PromotionState). Draft, InReview, Approved, Deprecated.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'PromotionState';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The instance''s prose story: what relationship/pattern this component captured as constructed and trained, judged for its individual contribution to the story the model tells. Browsable before building a new model — reuse starts here.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Story';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Embedding vector of Story (JSON float array) for similarity retrieval of reusable components. Written by the entity server on save when Story changes.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'StoryVector';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON judgment of this component''s contribution to the model''s story ({role, weight, evidence, reusePotential, reuseWhen}), written by the tagging agent at publish.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'StoryContribution';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'SHA-256 of Spec, for dedupe of identical hand-authored components.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'ContentHash';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Instance lifecycle, mirroring MJ: ML Models: Draft, Validated, Published (reusable by other models), Archived.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Monotonic instance version; a retrain that changes fitted state bumps it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Version';
GO

-- ============================================================================
-- 5. MLComponentBinding (MJ: ML Component Bindings) — instance I/O/params ↔ real MJ fields
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLComponentBinding] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ComponentID] UNIQUEIDENTIFIER NOT NULL,
    [Role] NVARCHAR(20) NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [EntityID] UNIQUEIDENTIFIER NULL,
    [EntityFieldID] UNIQUEIDENTIFIER NULL,
    [RelationshipPath] NVARCHAR(MAX) NULL,
    [DataType] NVARCHAR(20) NULL,
    [HigherIsBetter] BIT NULL,
    [Meaning] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_MLComponentBinding] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MLComponentBinding] UNIQUE ([ComponentID], [Role], [Name]),
    CONSTRAINT [FK_MLComponentBinding_Component] FOREIGN KEY ([ComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]),
    CONSTRAINT [FK_MLComponentBinding_Entity] FOREIGN KEY ([EntityID])
        REFERENCES ${flyway:defaultSchema}.[Entity]([ID]),
    CONSTRAINT [FK_MLComponentBinding_EntityField] FOREIGN KEY ([EntityFieldID])
        REFERENCES ${flyway:defaultSchema}.[EntityField]([ID]),
    CONSTRAINT [CK_MLComponentBinding_Role] CHECK ([Role] IN ('Input', 'Output', 'Parameter')),
    CONSTRAINT [CK_MLComponentBinding_DataType] CHECK ([DataType] IN ('Number', 'Date', 'Boolean', 'Duration', 'Category', 'Text'))
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Grounds a component instance in the business data: one row per named input, output, or parameter, optionally FK''d to the real MJ entity/field it reads or writes — so "weight 0.35" is on Members.DaysSinceLastLogin, not an abstract x3, and "which models touch this field" is an ordinary relational question. This is what makes components make business sense, not just mathematical sense.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentBinding';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Input (a feature/signal the component reads), Output (a value it emits — score, class, band), or Parameter (a weight or setting with business meaning).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentBinding', @level2type=N'COLUMN', @level2name=N'Role';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Logical name within the component: the feature column, output key ("score", "band"), or parameter key ("w_DaysSinceLastLogin"). Unique per (component, role).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentBinding', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON hop list from the component''s anchor entity to the bound field''s entity (explicit, or auto-resolved by the join-path helper; fails loud on ambiguity).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentBinding', @level2type=N'COLUMN', @level2name=N'RelationshipPath';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Semantic data type of the bound value: Number, Date, Boolean, Duration, Category, or Text.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentBinding', @level2type=N'COLUMN', @level2name=N'DataType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Direction of meaning for an Input: 1 = larger values indicate the "better"/positive end. NULL when direction is unknown or inapplicable.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentBinding', @level2type=N'COLUMN', @level2name=N'HigherIsBetter';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Business prose for this binding ("days since the member last signed in — recency of engagement").', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentBinding', @level2type=N'COLUMN', @level2name=N'Meaning';
GO

-- ============================================================================
-- 6. Additive columns on existing tables (all nullable — published rows unaffected)
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.[MLAlgorithm] ADD
    [ComponentTypeID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_MLAlgorithm_ComponentType]
        REFERENCES ${flyway:defaultSchema}.[MLComponentType]([ID]);
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Bridge to the typed-component catalog: the MJ: ML Component Types leaf this algorithm IS (e.g. the XGBoost row points at Model → Tree Ensemble → Boosting → XGBoost). Every existing read path (DriverClass, HyperparameterSchema, rankings) is unchanged; the component tree adds inherited preprocessing/hyperparameter banks, gates, and guidance on top.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLAlgorithm', @level2type=N'COLUMN', @level2name=N'ComponentTypeID';
GO

ALTER TABLE ${flyway:defaultSchema}.[MLTrainingPipeline] ADD
    [ComponentGraph] NVARCHAR(MAX) NULL,
    [DatedSources] NVARCHAR(MAX) NULL;
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Declarative component graph (JSON ComponentGraphNode: ComponentTypeRef, SlotName, Params, Children, ReuseComponentID) for models composed from typed components — a rubric with a weight set, a bagging wrapper around a base estimator, a stack of reused trained sub-components. NULL ⇒ the pipeline behaves exactly as before from AlgorithmID + Hyperparameters + FeatureSteps.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'ComponentGraph';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Persisted DatedSourceSpec[] (JSON): the dated/as-of feature sources this pipeline assembles. Closes the train→score round-trip gap — training copies this into MLModel.Lineage so scoring assembles the SAME as-of features without caller-supplied configuration.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'DatedSources';
GO

ALTER TABLE ${flyway:defaultSchema}.[MLModel] ADD
    [RootComponentID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_MLModel_RootComponent]
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]);
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Root of this trained model''s materialized component-instance tree (MJ: ML Components). The root instance also carries the model-level Story; walk ParentComponentID/SlotName beneath it for the full composition. NULL for models trained before the component model existed.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'RootComponentID';
GO
