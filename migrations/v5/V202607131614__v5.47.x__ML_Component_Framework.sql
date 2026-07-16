/**************************************************************************************************
 * Migration: Predictive Studio — Model Component Framework (ontology schema)
 *
 * Foundation migration for the typed-component ontology (see the Model Component Framework plan,
 * Document 1). One migration so CodeGen runs once; ALL composite-supporting and Task-widening
 * schema lands here so later phases (drivers, composite executor, trees) never force a second
 * migration.
 *
 * Tables created (FK order):
 *   1. MLPortType             (MJ: ML Port Types)              - typed port vocabulary
 *   2. MLComponent            (MJ: ML Components)              - THE uniform component registry
 *   3. MLComponentPort        (MJ: ML Component Ports)         - typed inputs/outputs per component
 *   4. MLComponentSlot        (MJ: ML Component Slots)         - fillable-template holes
 *   5. MLPortAdapter          (MJ: ML Port Adapters)           - declared cross-type coercions
 *   6. MLCompositeMembership  (MJ: ML Composite Memberships)   - composite -> child projection rows
 *
 * Tables altered (additive only; existing rows unaffected):
 *   - MLTrainingPipeline: +ComponentID (nullable); ProblemType CHECK widened to the 10-value Task union
 *   - MLModel: +ComponentID, +Kind, +ParentModelID, +Task; ProblemType CHECK widened
 *   - MLAlgorithmUseCase: ProblemTypeScope CHECK widened
 *
 * Design notes:
 *   - MLAlgorithm is NOT replaced (additive wrap): it remains the sidecar-driver catalog; the new
 *     MLComponent.AlgorithmID is the only linkage. Existing pipelines keep working via AlgorithmID.
 *   - Ports/slots/adapters are REAL ROWS (queryable: "what emits an embedding?"); the composite DAG
 *     is a Zod-validated GraphSpec JSON on the component, with MLCompositeMembership as the
 *     FK-integrity/lineage projection maintained on save.
 *   - The 10-value Task union is the single source of truth for problem/task categories; TypeScript
 *     (ALL_TASKS) and the sidecar's Pydantic Literal mirror it, with a contract test enforcing
 *     three-way lockstep.
 *   - Catalog ROWS (port types, the 57-model component catalog, templates, adapters) are seeded via
 *     metadata sync (mj sync push), never here.
 *
 * Schema/DDL only. CodeGen generates Entity/EntityField metadata, __mj timestamp columns, FK
 * indexes, views, and CRUD procs after this migration runs.
 *
 * Version: 5.47.x
 **************************************************************************************************/

-- ============================================================================
-- 1. MLPortType (MJ: ML Port Types) — typed port vocabulary
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLPortType] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [ShapeSpec] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT [PK_MLPortType] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MLPortType_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_MLPortType_Status] CHECK ([Status] IN ('Active', 'Deprecated'))
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The curated vocabulary of typed data-product kinds that flow between ML components. A component''s ports reference these types, and composition (wiring one component''s output into another''s input) is legal ONLY when the port types match or a declared MLPortAdapter bridges them — the enforcement that makes agent/user-designed model architectures sensible by construction. EXAMPLES: "features:tabular", "score", "probability", "latent-state", "embedding", "cluster-id", "survival-curve", "forecast-series", "transition-matrix", "attributions".', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique name of the port type, conventionally lowercase-hyphenated and named for the DATA SHAPE it carries, never for an algorithm (e.g., "transition-matrix", not "markov-output")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortType', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this port type carries and when to use it, readable by agents choosing wirings', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortType', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional JSON schema fragment describing the concrete wire shape of values of this type (e.g., for survival-curve: { times: number[], survival: number[] })', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortType', @level2type=N'COLUMN', @level2name=N'ShapeSpec';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle status: Active (usable in ports/adapters) or Deprecated', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortType', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- ============================================================================
-- 2. MLComponent (MJ: ML Components) — THE uniform component registry
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLComponent] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [Kind] NVARCHAR(20) NOT NULL,
    [AlgorithmID] UNIQUEIDENTIFIER NULL,
    [Task] NVARCHAR(20) NULL,
    [LearningType] NVARCHAR(20) NULL,
    [Parametric] NVARCHAR(10) NULL,
    [EnsembleType] NVARCHAR(20) NULL,
    [InterpretabilityClass] NVARCHAR(20) NULL,
    [DataShape] NVARCHAR(20) NULL,
    [HyperparameterSchema] NVARCHAR(MAX) NULL,
    [DefaultHyperparameters] NVARCHAR(MAX) NULL,
    [GraphSpec] NVARCHAR(MAX) NULL,
    [SupportsFeatureImportance] BIT NOT NULL DEFAULT 0,
    [Source] NVARCHAR(20) NOT NULL DEFAULT 'System',
    [CodeApprovalStatus] NVARCHAR(20) NOT NULL DEFAULT 'Approved',
    [ApprovedByUserID] UNIQUEIDENTIFIER NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT [PK_MLComponent] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MLComponent_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_MLComponent_Kind] CHECK ([Kind] IN ('Model', 'Preprocessing', 'Calibration', 'Adapter', 'Template', 'Composite', 'Source', 'Explainer', 'Transformation')),
    CONSTRAINT [CK_MLComponent_Task] CHECK ([Task] IN ('classification', 'regression', 'clustering', 'dim-reduction', 'anomaly', 'survival', 'forecasting', 'sequence-state', 'recommendation', 'pattern-mining')),
    CONSTRAINT [CK_MLComponent_LearningType] CHECK ([LearningType] IN ('Supervised', 'Unsupervised', 'Temporal')),
    CONSTRAINT [CK_MLComponent_Parametric] CHECK ([Parametric] IN ('Yes', 'No', 'Semi')),
    CONSTRAINT [CK_MLComponent_EnsembleType] CHECK ([EnsembleType] IN ('None', 'Single', 'Bagging', 'Boosting', 'Stacking')),
    CONSTRAINT [CK_MLComponent_InterpretabilityClass] CHECK ([InterpretabilityClass] IN ('Coefficients', 'Rules', 'ImportanceOnly', 'BlackBox', 'Structure')),
    CONSTRAINT [CK_MLComponent_DataShape] CHECK ([DataShape] IN ('Tabular', 'Sequence', 'EventLog', 'InteractionMatrix', 'Any')),
    CONSTRAINT [CK_MLComponent_Source] CHECK ([Source] IN ('System', 'User', 'Agent')),
    CONSTRAINT [CK_MLComponent_CodeApprovalStatus] CHECK ([CodeApprovalStatus] IN ('Pending', 'Approved', 'Rejected')),
    CONSTRAINT [CK_MLComponent_Status] CHECK ([Status] IN ('Planned', 'Active', 'Deprecated')),
    CONSTRAINT [FK_MLComponent_Algorithm] FOREIGN KEY ([AlgorithmID])
        REFERENCES ${flyway:defaultSchema}.[MLAlgorithm]([ID]),
    CONSTRAINT [FK_MLComponent_ApprovedByUser] FOREIGN KEY ([ApprovedByUserID])
        REFERENCES ${flyway:defaultSchema}.[User]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'THE uniform registry of typed ML components — the heart of the Model Component Framework. Models, preprocessing techniques, calibrators, port adapters, fillable templates (Bagging/Boosting/Stacking/Calibrator-wrap with typed holes), composite model DAGs, data sources, explainers, and transformations are ALL rows here, differing only by Kind. Every component declares typed input/output ports (MLComponentPort); templates declare typed holes (MLComponentSlot); composition legality is computed from port compatibility — a component''s membership affordances ("what larger structure can this belong to") are NEVER stored, always derived. Trained instances live in MLModel (linked back via MLModel.ComponentID) and are themselves reusable apply-frozen inside new composites.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique display name of the component (e.g., "XGBoost", "Yeo-Johnson Transform", "Isotonic Calibrator", "Bagging", "Cluster-Then-Classify")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What the component is and when to use it, readable by agents and business users', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What kind of component this is: Model (trainable estimator), Preprocessing (impute/scale/encode techniques), Calibration (score-to-probability), Adapter (port-type coercion), Template (fillable higher-order structure with typed holes), Composite (a concrete wired DAG of other components), Source (data producer: entity/query/feature-pipeline binding), Explainer (model+data to attributions), or Transformation (feature construction: lags, RFM, seasonality decomposition)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Kind';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'For driver-backed base models only: foreign key to the MLAlgorithm row carrying the Python-sidecar driver key. The ONLY linkage between the new component registry and the legacy algorithm catalog (additive-wrap design)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'AlgorithmID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Taxonomy axis — the task family this component addresses (models primarily; NULL for kinds where task does not apply). One of the 10-value Task union mirrored by TypeScript ALL_TASKS and the sidecar Pydantic Literal', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Task';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Taxonomy axis — Supervised, Unsupervised, or Temporal (sequence/series models whose supervision comes from time structure)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'LearningType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Taxonomy axis — whether the model is parametric (Yes), nonparametric (No), or semiparametric (Semi, e.g., Cox proportional hazards)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Parametric';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Taxonomy axis — composition technique of the estimator itself: None (not an estimator), Single, Bagging, Boosting, or Stacking', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'EnsembleType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Taxonomy axis — how the fitted component explains itself: Coefficients (inspectable weights with signs/CIs), Rules (tree/rule paths), ImportanceOnly (feature importances but no per-prediction logic), or BlackBox', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'InterpretabilityClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Taxonomy axis — the data shape the component consumes: Tabular, Sequence (time-indexed), EventLog (transaction streams), InteractionMatrix (user x item), or Any', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'DataShape';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON Schema describing the component''s tunable hyperparameters (drives UI forms, validation, and search priors)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'HyperparameterSchema';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object of default hyperparameter values applied when not overridden', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'DefaultHyperparameters';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'For Composite and Template kinds: the Zod-validated JSON graph specification — nodes (component references or slot placeholders), typed edges (with adapters), and the exposed terminal output. The authoritative wiring; MLCompositeMembership rows are the queryable projection of it', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'GraphSpec';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, the fitted component produces per-feature importance scores used for explainability and the leakage dominance guard', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'SupportsFeatureImportance';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Who authored this component: System (shipped), User, or Agent. Agent/User-authored components carrying new driver code are trust-gated via CodeApprovalStatus', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Source';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Trust gate for components carrying executable driver code (mirrors the Remote Operations AI-generation precedent): Pending (never runnable), Approved, or Rejected. Shipped System components default to Approved; composites of already-approved parts need no code review (promotion gates still apply)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'CodeApprovalStatus';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The user who approved this component''s code (Approver role), when CodeApprovalStatus is Approved and the component required review', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'ApprovedByUserID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle status: Planned (cataloged, no runnable driver yet — the sidecar /health endpoint reports which components are actually runnable), Active, or Deprecated', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponent', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- ============================================================================
-- 3. MLComponentPort (MJ: ML Component Ports) — typed inputs/outputs per component
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLComponentPort] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ComponentID] UNIQUEIDENTIFIER NOT NULL,
    [PortTypeID] UNIQUEIDENTIFIER NOT NULL,
    [Direction] NVARCHAR(10) NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [IsRequired] BIT NOT NULL DEFAULT 1,
    [Ordinal] INT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_MLComponentPort] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MLComponentPort_Component_Direction_Name] UNIQUE ([ComponentID], [Direction], [Name]),
    CONSTRAINT [CK_MLComponentPort_Direction] CHECK ([Direction] IN ('Input', 'Output')),
    CONSTRAINT [FK_MLComponentPort_Component] FOREIGN KEY ([ComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]),
    CONSTRAINT [FK_MLComponentPort_PortType] FOREIGN KEY ([PortTypeID])
        REFERENCES ${flyway:defaultSchema}.[MLPortType]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A typed input or output declared by an ML component — the component''s composition contract. Real rows (not JSON) so agents and queries can ask "which components emit an embedding?" directly, and so a component''s membership affordances ("which template slots can I fill?") are computable from port compatibility alone. EXAMPLE: HMM declares Output port "states" of type latent-state; XGBoost declares Input port "X" of type features:tabular and Output port "score" of type score.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentPort';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the component declaring this port', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentPort', @level2type=N'COLUMN', @level2name=N'ComponentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the port type (the typed kind of data flowing through this port)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentPort', @level2type=N'COLUMN', @level2name=N'PortTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this port consumes (Input) or produces (Output)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentPort', @level2type=N'COLUMN', @level2name=N'Direction';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Local name of the port on this component (e.g., "X", "y", "states", "curve"), unique per component+direction', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentPort', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1 (inputs), the port must be bound for the component to run; optional inputs (e.g., sample weights) are 0. Informational for outputs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentPort', @level2type=N'COLUMN', @level2name=N'IsRequired';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display/processing order of the port within its component+direction group', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentPort', @level2type=N'COLUMN', @level2name=N'Ordinal';
GO

-- ============================================================================
-- 4. MLComponentSlot (MJ: ML Component Slots) — fillable-template holes
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLComponentSlot] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ComponentID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [RequiredPortTypeID] UNIQUEIDENTIFIER NOT NULL,
    [MinCount] INT NOT NULL DEFAULT 1,
    [MaxCount] INT NULL,
    CONSTRAINT [PK_MLComponentSlot] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MLComponentSlot_Component_Name] UNIQUE ([ComponentID], [Name]),
    CONSTRAINT [FK_MLComponentSlot_Component] FOREIGN KEY ([ComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]),
    CONSTRAINT [FK_MLComponentSlot_RequiredPortType] FOREIGN KEY ([RequiredPortTypeID])
        REFERENCES ${flyway:defaultSchema}.[MLPortType]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A typed HOLE on a fillable Template component — the higher-order composition contract. A slot names what a filling component must emit (RequiredPortTypeID) and how many fillers it takes (MinCount..MaxCount, NULL MaxCount = unbounded). Filling every slot of a template yields a concrete Composite, which is itself pluggable — recursion for free. EXAMPLES: Bagging declares slot "BaseLearner" (requires score, 1..N); Stacking declares "Learners" (score, 2..N) and "MetaLearner" (score, exactly 1); the Uplift template declares two slots requiring PROBABILITY (not score) — the port type itself enforces the calibration dependency.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentSlot';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Template component declaring this hole', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentSlot', @level2type=N'COLUMN', @level2name=N'ComponentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Name of the slot within its template (e.g., "BaseLearner", "MetaLearner", "TreatedModel"), unique per template', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentSlot', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this slot is for and any filling guidance beyond the port-type requirement', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentSlot', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the port type a filling component must EMIT for the fill to be legal — the typed contract that keeps agent-built architectures sensible', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentSlot', @level2type=N'COLUMN', @level2name=N'RequiredPortTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Minimum number of components that must fill this slot', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentSlot', @level2type=N'COLUMN', @level2name=N'MinCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum number of components that may fill this slot; NULL means unbounded', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLComponentSlot', @level2type=N'COLUMN', @level2name=N'MaxCount';
GO

-- ============================================================================
-- 5. MLPortAdapter (MJ: ML Port Adapters) — declared cross-type coercions
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLPortAdapter] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [FromPortTypeID] UNIQUEIDENTIFIER NOT NULL,
    [ToPortTypeID] UNIQUEIDENTIFIER NOT NULL,
    [Strategy] NVARCHAR(50) NOT NULL,
    [ImplementationKey] NVARCHAR(255) NULL,
    [IsLossy] BIT NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT [PK_MLPortAdapter] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MLPortAdapter_From_To_Strategy] UNIQUE ([FromPortTypeID], [ToPortTypeID], [Strategy]),
    CONSTRAINT [CK_MLPortAdapter_Status] CHECK ([Status] IN ('Active', 'Deprecated')),
    CONSTRAINT [FK_MLPortAdapter_FromPortType] FOREIGN KEY ([FromPortTypeID])
        REFERENCES ${flyway:defaultSchema}.[MLPortType]([ID]),
    CONSTRAINT [FK_MLPortAdapter_ToPortType] FOREIGN KEY ([ToPortTypeID])
        REFERENCES ${flyway:defaultSchema}.[MLPortType]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A declared, named coercion from one port type to another, making otherwise-mismatched wirings legal EXPLICITLY (never implicitly). Adapters are what let cross-family chains compose: cluster-id one-hot-encoded into tabular features, a latent state sequence reduced to a per-record state feature, a probability passed through as a numeric feature. Lossy adapters are flagged so UIs can warn.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortAdapter';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the adapter (e.g., "Cluster ID One-Hot", "State Sequence Last-State")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortAdapter', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the port type this adapter consumes', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortAdapter', @level2type=N'COLUMN', @level2name=N'FromPortTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the port type this adapter produces', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortAdapter', @level2type=N'COLUMN', @level2name=N'ToPortTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The coercion technique (e.g., "onehot", "identity", "argmax", "last-state", "threshold")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortAdapter', @level2type=N'COLUMN', @level2name=N'Strategy';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Key of the runtime implementation that executes this adapter in the composition engine', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortAdapter', @level2type=N'COLUMN', @level2name=N'ImplementationKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, the coercion discards information (e.g., argmax over soft assignments) — surfaced as a warning in composition UIs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortAdapter', @level2type=N'COLUMN', @level2name=N'IsLossy';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle status: Active or Deprecated', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLPortAdapter', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- ============================================================================
-- 6. MLCompositeMembership (MJ: ML Composite Memberships) — composite -> child projection
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLCompositeMembership] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [CompositeComponentID] UNIQUEIDENTIFIER NOT NULL,
    [ChildComponentID] UNIQUEIDENTIFIER NOT NULL,
    [Role] NVARCHAR(100) NULL,
    CONSTRAINT [PK_MLCompositeMembership] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MLCompositeMembership_Composite] FOREIGN KEY ([CompositeComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]),
    CONSTRAINT [FK_MLCompositeMembership_Child] FOREIGN KEY ([ChildComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Queryable projection of a Composite component''s child references. The authoritative wiring lives in MLComponent.GraphSpec (validated JSON); these rows are maintained on save purely so SQL lineage queries ("which composites use this component?") and FK integrity to children exist. Never edited directly.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLCompositeMembership';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Composite (or filled Template) component', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLCompositeMembership', @level2type=N'COLUMN', @level2name=N'CompositeComponentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to a child component referenced by the composite''s graph', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLCompositeMembership', @level2type=N'COLUMN', @level2name=N'ChildComponentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional role of the child within the composite (the slot or node key it fills, e.g., "BaseLearner", "clusterer")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLCompositeMembership', @level2type=N'COLUMN', @level2name=N'Role';
GO

-- ============================================================================
-- 7. ALTER MLTrainingPipeline — +ComponentID; widen ProblemType to the Task union
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.[MLTrainingPipeline] ADD
    [ComponentID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [FK_MLTrainingPipeline_Component] FOREIGN KEY ([ComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]);
GO

ALTER TABLE ${flyway:defaultSchema}.[MLTrainingPipeline] DROP CONSTRAINT [CK_MLTrainingPipeline_ProblemType];
GO
ALTER TABLE ${flyway:defaultSchema}.[MLTrainingPipeline] ADD CONSTRAINT [CK_MLTrainingPipeline_ProblemType]
    CHECK ([ProblemType] IN ('classification', 'regression', 'clustering', 'dim-reduction', 'anomaly', 'survival', 'forecasting', 'sequence-state', 'recommendation', 'pattern-mining'));
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional foreign key to the ML Component this pipeline trains (the component-framework path). NULL pipelines resolve through the legacy AlgorithmID path; when set, the component''s ports/graph govern assembly and execution', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLTrainingPipeline', @level2type=N'COLUMN', @level2name=N'ComponentID';
GO

-- ============================================================================
-- 8. ALTER MLModel — +ComponentID, +Kind, +ParentModelID, +Task; widen ProblemType
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.[MLModel] ADD
    [ComponentID] UNIQUEIDENTIFIER NULL,
    [Kind] NVARCHAR(20) NOT NULL DEFAULT 'Standard',
    [ParentModelID] UNIQUEIDENTIFIER NULL,
    [Task] NVARCHAR(20) NULL,
    CONSTRAINT [CK_MLModel_Kind] CHECK ([Kind] IN ('Standard', 'Composite', 'CompositeChild')),
    CONSTRAINT [CK_MLModel_Task] CHECK ([Task] IN ('classification', 'regression', 'clustering', 'dim-reduction', 'anomaly', 'survival', 'forecasting', 'sequence-state', 'recommendation', 'pattern-mining')),
    CONSTRAINT [FK_MLModel_Component] FOREIGN KEY ([ComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]),
    CONSTRAINT [FK_MLModel_ParentModel] FOREIGN KEY ([ParentModelID])
        REFERENCES ${flyway:defaultSchema}.[MLModel]([ID]);
GO

ALTER TABLE ${flyway:defaultSchema}.[MLModel] DROP CONSTRAINT [CK_MLModel_ProblemType];
GO
ALTER TABLE ${flyway:defaultSchema}.[MLModel] ADD CONSTRAINT [CK_MLModel_ProblemType]
    CHECK ([ProblemType] IN ('classification', 'regression', 'clustering', 'dim-reduction', 'anomaly', 'survival', 'forecasting', 'sequence-state', 'recommendation', 'pattern-mining'));
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional foreign key to the ML Component definition this trained model is an instance of. Trained instances are themselves reusable components: a composite graph may reference a published MLModel apply-frozen (never re-fit) — the organization''s accumulating library of trained capabilities', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'ComponentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this trained model row is: Standard (a plain single-estimator model), Composite (the parent of a trained DAG — its artifact is the CompositeManifest referencing child models), or CompositeChild (a child fitted inside a composite training run; filtered out of leaderboards and catalogs by default)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'Kind';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'For CompositeChild rows: the Composite parent model this child was fitted under (composite training lineage)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'ParentModelID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The task family of this trained model, from the 10-value Task union (supersedes the binary ProblemType for new-framework models; ProblemType retained for backward compatibility)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLModel', @level2type=N'COLUMN', @level2name=N'Task';
GO

-- ============================================================================
-- 9. ALTER MLAlgorithmUseCase — widen ProblemTypeScope to the Task union (+ 'any')
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.[MLAlgorithmUseCase] DROP CONSTRAINT [CK_MLAlgorithmUseCase_ProblemTypeScope];
GO
ALTER TABLE ${flyway:defaultSchema}.[MLAlgorithmUseCase] ADD CONSTRAINT [CK_MLAlgorithmUseCase_ProblemTypeScope]
    CHECK ([ProblemTypeScope] IN ('classification', 'regression', 'clustering', 'dim-reduction', 'anomaly', 'survival', 'forecasting', 'sequence-state', 'recommendation', 'pattern-mining', 'any'));
GO
