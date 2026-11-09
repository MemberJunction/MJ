-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609302342__v6.2.x__Rubrics.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- PostgreSQL ordering differs from SQL Server for MJ: Rubric Evaluations and MJ: Rubric Evaluation Scores.
-- They are registered here already LAYERED (GeneratedBaseViewName set), so their CRUD functions
-- RETURNS SETOF the application-owned outer view, which V202609302344 creates. SQL Server tolerates a
-- routine that names a missing view; PostgreSQL does not. Their CodeGen is therefore NOT in this file:
-- V202609302343 creates their inner views and V202609302344 carries their full CodeGen once the outer
-- views exist. The CodeGen section below covers this migration's other entities.

-- The nine hand-written immutability triggers in the source are hand-ported below (section 4).

/*
    Rubrics — a first-class MemberJunction primitive for evaluating any record against weighted,
    nested, versioned criteria.

    Design + build plan: plans/rubrics/RUBRICS_PLAN.md (read it before changing anything here).

    WHAT THIS MIGRATION ADDS (all in the core schema)

      Definition side
        RubricCategory        folders for rubrics (self-referencing tree)
        RubricScale           reusable response scales: ordered levels (1-5 Likert, Pass/Fail,
                              Compliant/Partial/Non-compliant) or a numeric range
        RubricScaleLevel      the levels of a 'Levels' scale, each with a normalized 0..1 value
        Rubric                the stable identity of a rubric
        RubricVersion         an immutable-once-published, semantically versioned snapshot
                              (Major.Minor.Patch computed by the server at publish time)
        RubricCriterion       a weighted TREE of groups and criteria, owned by one version
        RubricCriterionLevel  per-criterion anchor text for a scale level (or a numeric anchor)
        RubricBand            display/reporting interpretation of the normalized score
                              (e.g. Exemplary / Proficient). Bands NEVER decide pass/fail.

      Result side
        RubricEvaluation      one evaluator's judgment of one record against one pinned version.
                              Computed results are written ONCE at submit and never recomputed.
        RubricEvaluationScore one row per criterion (and per group, as computed rollup rows)

      Consumers
        AIAgentRubric         rubrics an agent publishes: for evaluation, self-check, or sampling
                              of production runs
        Test.RubricID         the rubric a test is judged by (NULL = inherit from its suite)
        TestSuite.RubricID    default rubric for tests in the suite (walks up ParentID)
        TestSuiteRun.Score    the suite-level score the engine already computes and discarded

    SCORE SCALE. Every stored score, threshold and band boundary is NORMALIZED to 0..1. The
    version's ScoreDisplayMin/Max exist only so a UI can render 0..1 as 0..100, 1..5, etc.
    A single canonical scale is deliberate: consumers that let each rubric's raw units leak into
    thresholds end up with a UI and a router that disagree about what a number means.

    IMMUTABILITY. A published version (and everything it owns) and a submitted evaluation (and
    its score rows) are frozen. The primary guard is the server-side entity subclasses, which
    return clear validation errors; the triggers at the bottom of the hand-written section are the
    BACKSTOP against raw SQL and any path that bypasses BaseEntity. Corrections are never edits:
    a changed rubric is a new version, and a changed judgment is a new evaluation that supersedes
    the old one.

    LAYERED BASE VIEWS. RubricEvaluation and RubricEvaluationScore expose cheap, on-demand
    consensus (cohort mean / spread / human-vs-AI) through application-owned wrapper views over
    CodeGen's generated views. The layering flags and the Label name-field pins are metadata
    (metadata/entities/.layered-base-views.json and .rubric-label-name-fields.json), applied
    with mj sync push. They are not updated from a migration. Two further files, forced by
    ordering:
      V202609302343  the captured inner vw*Generated views, including the EntityField rows that register them
      V202609302344  the consensus wrapper views, then the capture that registers their columns
    See the plan, section "Layered base views: the migration sequence".

    TestRubric is DEPRECATED alongside this migration, through metadata rather than DDL:
    metadata/entities/.test-rubrics-deprecation.json sets the entity's Status to Deprecated and
    replaces its description. It has never been read by the test engine, links to nothing, and
    has no seed rows; the table is dropped at the next major version.
*/
/* ════════════════════════════════════════════════════════════════════════════════════ */
/* 1. Definition side */
/* ════════════════════════════════════════════════════════════════════════════════════ */
CREATE TABLE __mj."RubricCategory" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "ParentID" UUID NULL,
  CONSTRAINT "PK_RubricCategory" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RubricCategory_Parent" FOREIGN KEY ("ParentID") REFERENCES __mj."RubricCategory" (
    "ID"
  )
);

CREATE TABLE __mj."RubricScale" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "ScaleType" VARCHAR(20) NOT NULL DEFAULT (
    'Levels'
  ),
  "MinValue" DECIMAL(18, 6) NULL,
  "MaxValue" DECIMAL(18, 6) NULL,
  "Step" DECIMAL(18, 6) NULL,
  "HigherIsBetter" BOOLEAN NOT NULL DEFAULT TRUE,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  CONSTRAINT "PK_RubricScale" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_RubricScale_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "CK_RubricScale_ScaleType" CHECK ("ScaleType" IN ('Levels', 'Numeric')),
  CONSTRAINT "CK_RubricScale_Status" CHECK ("Status" IN ('Active', 'Disabled')),
  CONSTRAINT "CK_RubricScale_NumericRange" CHECK ("ScaleType" = 'Levels'
  OR (
    NOT "MinValue" IS NULL AND NOT "MaxValue" IS NULL AND "MaxValue" > "MinValue"
  )),
  CONSTRAINT "CK_RubricScale_Step" CHECK ("Step" IS NULL OR "Step" > 0)
);

CREATE TABLE __mj."RubricScaleLevel" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "ScaleID" UUID NOT NULL,
  "Label" VARCHAR(100) NOT NULL,
  "Value" DECIMAL(18, 6) NOT NULL,
  "NormalizedValue" DECIMAL(9, 6) NOT NULL,
  "Description" TEXT NULL,
  "Sequence" INT NOT NULL DEFAULT (
    0
  ),
  CONSTRAINT "PK_RubricScaleLevel" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RubricScaleLevel_Scale" FOREIGN KEY ("ScaleID") REFERENCES __mj."RubricScale" (
    "ID"
  ),
  CONSTRAINT "UQ_RubricScaleLevel_Label" UNIQUE (
    "ScaleID",
    "Label"
  ),
  CONSTRAINT "UQ_RubricScaleLevel_Sequence" UNIQUE (
    "ScaleID",
    "Sequence"
  ),
  CONSTRAINT "CK_RubricScaleLevel_NormalizedValue" CHECK ("NormalizedValue" >= 0 AND "NormalizedValue" <= 1)
);

CREATE TABLE __mj."Rubric" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "CategoryID" UUID NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  CONSTRAINT "PK_Rubric" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_Rubric_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "FK_Rubric_Category" FOREIGN KEY ("CategoryID") REFERENCES __mj."RubricCategory" (
    "ID"
  ),
  CONSTRAINT "CK_Rubric_Status" CHECK ("Status" IN ('Active', 'Disabled'))
);

CREATE TABLE __mj."RubricVersion" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "RubricID" UUID NOT NULL,
  "MajorVersion" INT NULL,
  "MinorVersion" INT NULL,
  "PatchVersion" INT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Draft'
  ),
  "BasedOnVersionID" UUID NULL,
  "Instructions" TEXT NULL,
  "PassThreshold" DECIMAL(9, 6) NULL,
  "MinimumCompleteness" DECIMAL(9, 6) NULL,
  "NotApplicablePolicy" VARCHAR(30) NOT NULL DEFAULT (
    'ExcludeAndRedistribute'
  ),
  "ScoreDisplayMin" DECIMAL(18, 6) NOT NULL DEFAULT (
    0
  ),
  "ScoreDisplayMax" DECIMAL(18, 6) NOT NULL DEFAULT (
    100
  ),
  "RequestedBump" VARCHAR(10) NULL,
  "ComputedBump" VARCHAR(10) NULL,
  "AppliedBump" VARCHAR(10) NULL,
  "ChangeSummary" TEXT NULL,
  "ChangeDetails" TEXT NULL,
  "ContentHash" VARCHAR(64) NULL,
  "ScoringHash" VARCHAR(64) NULL,
  "PublishedAt" TIMESTAMPTZ NULL,
  "PublishedByUserID" UUID NULL,
  "RetiredAt" TIMESTAMPTZ NULL,
  CONSTRAINT "PK_RubricVersion" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RubricVersion_Rubric" FOREIGN KEY ("RubricID") REFERENCES __mj."Rubric" (
    "ID"
  ),
  CONSTRAINT "FK_RubricVersion_BasedOnVersion" FOREIGN KEY ("BasedOnVersionID") REFERENCES __mj."RubricVersion" (
    "ID"
  ),
  CONSTRAINT "FK_RubricVersion_PublishedByUser" FOREIGN KEY ("PublishedByUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "CK_RubricVersion_Status" CHECK ("Status" IN ('Draft', 'Published', 'Retired')),
  CONSTRAINT "CK_RubricVersion_NotApplicablePolicy" CHECK ("NotApplicablePolicy" IN ('ExcludeAndRedistribute', 'CountAsZero', 'FailEvaluation', 'NotAllowed')),
  CONSTRAINT "CK_RubricVersion_RequestedBump" CHECK ("RequestedBump" IN ('Major', 'Minor', 'Patch')),
  CONSTRAINT "CK_RubricVersion_ComputedBump" CHECK ("ComputedBump" IN ('Initial', 'Major', 'Minor', 'Patch')),
  CONSTRAINT "CK_RubricVersion_AppliedBump" CHECK ("AppliedBump" IN ('Initial', 'Major', 'Minor', 'Patch')),
  CONSTRAINT "CK_RubricVersion_PassThreshold" CHECK ("PassThreshold" IS NULL OR (
    "PassThreshold" >= 0 AND "PassThreshold" <= 1
  )),
  CONSTRAINT "CK_RubricVersion_MinimumCompleteness" CHECK ("MinimumCompleteness" IS NULL
  OR (
    "MinimumCompleteness" >= 0 AND "MinimumCompleteness" <= 1
  )),
  CONSTRAINT "CK_RubricVersion_DisplayRange" CHECK ("ScoreDisplayMax" > "ScoreDisplayMin"),
  CONSTRAINT "CK_RubricVersion_VersionNumbers" CHECK ((
    "MajorVersion" IS NULL OR "MajorVersion" >= 0
  )
  AND (
    "MinorVersion" IS NULL OR "MinorVersion" >= 0
  )
  AND (
    "PatchVersion" IS NULL OR "PatchVersion" >= 0
  )),
  CONSTRAINT "CK_RubricVersion_PublishedIsComplete" CHECK ("Status" = 'Draft'
  OR (
    NOT "MajorVersion" IS NULL
    AND NOT "MinorVersion" IS NULL
    AND NOT "PatchVersion" IS NULL
    AND NOT "ContentHash" IS NULL
    AND NOT "ScoringHash" IS NULL
    AND NOT "PublishedAt" IS NULL
    AND NOT "AppliedBump" IS NULL
  ))
);

/* A draft carries no number until it is published; published numbers are unique per rubric. */
CREATE UNIQUE INDEX "UQ_RubricVersion_Number" ON __mj."RubricVersion"("RubricID", "MajorVersion", "MinorVersion", "PatchVersion")
WHERE
  NOT "MajorVersion" IS NULL;

/* At most one open draft per rubric: every edit starts from it, so two would fork the lineage. */
CREATE UNIQUE INDEX "UQ_RubricVersion_OneDraft" ON __mj."RubricVersion"("RubricID")
WHERE
  "Status" = 'Draft';

CREATE TABLE __mj."RubricCriterion" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "RubricVersionID" UUID NOT NULL,
  "ParentID" UUID NULL,
  "Key" VARCHAR(100) NOT NULL,
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "Guidance" TEXT NULL,
  "NodeType" VARCHAR(20) NOT NULL DEFAULT (
    'Criterion'
  ),
  "ScaleID" UUID NULL,
  "Weight" DECIMAL(18, 6) NOT NULL DEFAULT (
    1
  ),
  "IsAdvisory" BOOLEAN NOT NULL DEFAULT FALSE,
  "IsGate" BOOLEAN NOT NULL DEFAULT FALSE,
  "GateMinimumScore" DECIMAL(9, 6) NULL,
  "NotApplicablePolicy" VARCHAR(30) NULL,
  "RollupMethod" VARCHAR(20) NULL,
  "EvidenceRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "RationaleRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "Sequence" INT NOT NULL DEFAULT (
    0
  ),
  "EvaluatorConfig" TEXT NULL,
  CONSTRAINT "PK_RubricCriterion" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RubricCriterion_RubricVersion" FOREIGN KEY ("RubricVersionID") REFERENCES __mj."RubricVersion" (
    "ID"
  ) ON DELETE CASCADE,
  CONSTRAINT "FK_RubricCriterion_Parent" FOREIGN KEY ("ParentID") REFERENCES __mj."RubricCriterion" (
    "ID"
  ),
  CONSTRAINT "FK_RubricCriterion_Scale" FOREIGN KEY ("ScaleID") REFERENCES __mj."RubricScale" (
    "ID"
  ),
  CONSTRAINT "UQ_RubricCriterion_Key" UNIQUE (
    "RubricVersionID",
    "Key"
  ),
  CONSTRAINT "CK_RubricCriterion_NodeType" CHECK ("NodeType" IN ('Group', 'Criterion')),
  CONSTRAINT "CK_RubricCriterion_NotApplicablePolicy" CHECK ("NotApplicablePolicy" IN ('ExcludeAndRedistribute', 'CountAsZero', 'FailEvaluation', 'NotAllowed')),
  CONSTRAINT "CK_RubricCriterion_RollupMethod" CHECK ("RollupMethod" IN ('WeightedMean', 'Minimum', 'Maximum')),
  CONSTRAINT "CK_RubricCriterion_Weight" CHECK ("Weight" >= 0),
  CONSTRAINT "CK_RubricCriterion_GateMinimumScore" CHECK ("GateMinimumScore" IS NULL
  OR (
    "GateMinimumScore" >= 0 AND "GateMinimumScore" <= 1
  )),
  CONSTRAINT "CK_RubricCriterion_ScaleByNodeType" CHECK ((
    "NodeType" = 'Criterion' AND NOT "ScaleID" IS NULL
  )
  OR (
    "NodeType" = 'Group' AND "ScaleID" IS NULL
  )),
  CONSTRAINT "CK_RubricCriterion_RollupOnGroupsOnly" CHECK ("NodeType" = 'Group' OR "RollupMethod" IS NULL),
  CONSTRAINT "CK_RubricCriterion_GateNeedsMinimum" CHECK ("IsGate" = FALSE OR NOT "GateMinimumScore" IS NULL),
  CONSTRAINT "CK_RubricCriterion_AdvisoryIsNotGate" CHECK (NOT (
    "IsAdvisory" = TRUE AND "IsGate" = TRUE
  ))
);

CREATE TABLE __mj."RubricCriterionLevel" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "CriterionID" UUID NOT NULL,
  "ScaleLevelID" UUID NULL,
  "AnchorValue" DECIMAL(18, 6) NULL,
  "Descriptor" TEXT NOT NULL,
  CONSTRAINT "PK_RubricCriterionLevel" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RubricCriterionLevel_Criterion" FOREIGN KEY ("CriterionID") REFERENCES __mj."RubricCriterion" (
    "ID"
  ),
  CONSTRAINT "FK_RubricCriterionLevel_ScaleLevel" FOREIGN KEY ("ScaleLevelID") REFERENCES __mj."RubricScaleLevel" (
    "ID"
  ),
  CONSTRAINT "CK_RubricCriterionLevel_OneAnchor" CHECK ((
    NOT "ScaleLevelID" IS NULL AND "AnchorValue" IS NULL
  )
  OR (
    "ScaleLevelID" IS NULL AND NOT "AnchorValue" IS NULL
  ))
);

/* Filtered, because a plain UNIQUE treats NULLs as equal and would reject a second numeric anchor. */
CREATE UNIQUE INDEX "UQ_RubricCriterionLevel_ScaleLevel" ON __mj."RubricCriterionLevel"("CriterionID", "ScaleLevelID")
WHERE
  NOT "ScaleLevelID" IS NULL;

CREATE UNIQUE INDEX "UQ_RubricCriterionLevel_AnchorValue" ON __mj."RubricCriterionLevel"("CriterionID", "AnchorValue")
WHERE
  NOT "AnchorValue" IS NULL;

CREATE TABLE __mj."RubricBand" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "RubricVersionID" UUID NOT NULL,
  "Label" VARCHAR(100) NOT NULL,
  "Description" TEXT NULL,
  "MinScore" DECIMAL(9, 6) NOT NULL,
  "MaxScore" DECIMAL(9, 6) NOT NULL,
  "DisplayTone" VARCHAR(20) NOT NULL DEFAULT (
    'Neutral'
  ),
  "Sequence" INT NOT NULL DEFAULT (
    0
  ),
  CONSTRAINT "PK_RubricBand" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RubricBand_RubricVersion" FOREIGN KEY ("RubricVersionID") REFERENCES __mj."RubricVersion" (
    "ID"
  ),
  CONSTRAINT "UQ_RubricBand_Label" UNIQUE (
    "RubricVersionID",
    "Label"
  ),
  CONSTRAINT "CK_RubricBand_DisplayTone" CHECK ("DisplayTone" IN ('Success', 'Info', 'Neutral', 'Warning', 'Error')),
  CONSTRAINT "CK_RubricBand_Range" CHECK ("MinScore" >= 0 AND "MaxScore" <= 1 AND "MinScore" < "MaxScore")
);

/* ════════════════════════════════════════════════════════════════════════════════════ */
/* 2. Result side */
/* ════════════════════════════════════════════════════════════════════════════════════ */
CREATE TABLE __mj."RubricEvaluation" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "RubricVersionID" UUID NOT NULL,
  "SubjectEntityID" UUID NOT NULL,
  "SubjectRecordID" VARCHAR(450) NOT NULL,
  "ContextEntityID" UUID NULL,
  "ContextRecordID" VARCHAR(450) NULL,
  "EvaluatorType" VARCHAR(20) NOT NULL,
  "EvaluatorUserID" UUID NULL,
  "AIPromptRunID" UUID NULL,
  "AIAgentRunID" UUID NULL,
  "EvaluatorName" VARCHAR(255) NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Draft'
  ),
  "SupersedesEvaluationID" UUID NULL,
  "SubmittedAt" TIMESTAMPTZ NULL,
  "PassThresholdApplied" DECIMAL(9, 6) NULL,
  "NormalizedScore" DECIMAL(9, 6) NULL,
  "Passed" BOOLEAN NULL,
  "Outcome" VARCHAR(30) NULL,
  "BandID" UUID NULL,
  "GateFailed" BOOLEAN NOT NULL DEFAULT FALSE,
  "Completeness" DECIMAL(9, 6) NULL,
  "ScoredCriteriaCount" INT NULL,
  "ApplicableCriteriaCount" INT NULL,
  "TotalCriteriaCount" INT NULL,
  "Confidence" DECIMAL(9, 6) NULL,
  "Narrative" TEXT NULL,
  "ErrorMessage" TEXT NULL,
  "ScoringEngineVersion" VARCHAR(20) NULL,
  "Metadata" TEXT NULL,
  CONSTRAINT "PK_RubricEvaluation" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RubricEvaluation_RubricVersion" FOREIGN KEY ("RubricVersionID") REFERENCES __mj."RubricVersion" (
    "ID"
  ),
  CONSTRAINT "FK_RubricEvaluation_SubjectEntity" FOREIGN KEY ("SubjectEntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_RubricEvaluation_ContextEntity" FOREIGN KEY ("ContextEntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_RubricEvaluation_EvaluatorUser" FOREIGN KEY ("EvaluatorUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_RubricEvaluation_AIPromptRun" FOREIGN KEY ("AIPromptRunID") REFERENCES __mj."AIPromptRun" (
    "ID"
  ),
  CONSTRAINT "FK_RubricEvaluation_AIAgentRun" FOREIGN KEY ("AIAgentRunID") REFERENCES __mj."AIAgentRun" (
    "ID"
  ),
  CONSTRAINT "FK_RubricEvaluation_SupersedesEvaluation" FOREIGN KEY ("SupersedesEvaluationID") REFERENCES __mj."RubricEvaluation" (
    "ID"
  ),
  CONSTRAINT "FK_RubricEvaluation_Band" FOREIGN KEY ("BandID") REFERENCES __mj."RubricBand" (
    "ID"
  ),
  CONSTRAINT "CK_RubricEvaluation_EvaluatorType" CHECK ("EvaluatorType" IN ('Human', 'AIPrompt', 'Agent', 'Deterministic', 'Self', 'External')),
  CONSTRAINT "CK_RubricEvaluation_Status" CHECK ("Status" IN ('Draft', 'Submitted', 'Superseded', 'Withdrawn', 'Failed')),
  CONSTRAINT "CK_RubricEvaluation_Outcome" CHECK ("Outcome" IN (
    'Passed',
    'BelowThreshold',
    'GateFailed',
    'NotApplicableFailure',
    'Incomplete',
    'Scored'
  )),
  CONSTRAINT "CK_RubricEvaluation_ContextPair" CHECK ((
    "ContextEntityID" IS NULL AND "ContextRecordID" IS NULL
  )
  OR (
    NOT "ContextEntityID" IS NULL AND NOT "ContextRecordID" IS NULL
  )),
  CONSTRAINT "CK_RubricEvaluation_HumanHasUser" CHECK ("EvaluatorType" <> 'Human' OR NOT "EvaluatorUserID" IS NULL),
  CONSTRAINT "CK_RubricEvaluation_Scores" CHECK ((
    "NormalizedScore" IS NULL
    OR (
      "NormalizedScore" >= 0 AND "NormalizedScore" <= 1
    )
  )
  AND (
    "PassThresholdApplied" IS NULL
    OR (
      "PassThresholdApplied" >= 0 AND "PassThresholdApplied" <= 1
    )
  )
  AND (
    "Completeness" IS NULL OR (
      "Completeness" >= 0 AND "Completeness" <= 1
    )
  )
  AND (
    "Confidence" IS NULL OR (
      "Confidence" >= 0 AND "Confidence" <= 1
    )
  )),
  CONSTRAINT "CK_RubricEvaluation_SubmittedIsComputed" CHECK (NOT "Status" IN ('Submitted', 'Superseded', 'Withdrawn')
  OR (
    NOT "SubmittedAt" IS NULL AND NOT "Outcome" IS NULL
  ))
);

/* Consensus lookups are driven by the subject: "every evaluation of this record". The wrapper */
/* view's cohort aggregate seeks on this index rather than scanning the table. */
CREATE INDEX "IX_RubricEvaluation_Cohort" ON __mj."RubricEvaluation"("SubjectEntityID", "SubjectRecordID", "Status") INCLUDE ("ContextEntityID", "ContextRecordID", "RubricVersionID", "EvaluatorType", "NormalizedScore", "Passed");

CREATE TABLE __mj."RubricEvaluationScore" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "EvaluationID" UUID NOT NULL,
  "CriterionID" UUID NOT NULL,
  "ScaleLevelID" UUID NULL,
  "RawValue" DECIMAL(18, 6) NULL,
  "IsNotApplicable" BOOLEAN NOT NULL DEFAULT FALSE,
  "IsComputed" BOOLEAN NOT NULL DEFAULT FALSE,
  "NormalizedScore" DECIMAL(9, 6) NULL,
  "EffectiveWeight" DECIMAL(9, 6) NULL,
  "OverallContribution" DECIMAL(9, 6) NULL,
  "GateFailed" BOOLEAN NOT NULL DEFAULT FALSE,
  "Completeness" DECIMAL(9, 6) NULL,
  "Confidence" DECIMAL(9, 6) NULL,
  "Rationale" TEXT NULL,
  "Evidence" TEXT NULL,
  CONSTRAINT "PK_RubricEvaluationScore" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RubricEvaluationScore_Evaluation" FOREIGN KEY ("EvaluationID") REFERENCES __mj."RubricEvaluation" (
    "ID"
  ),
  CONSTRAINT "FK_RubricEvaluationScore_Criterion" FOREIGN KEY ("CriterionID") REFERENCES __mj."RubricCriterion" (
    "ID"
  ),
  CONSTRAINT "FK_RubricEvaluationScore_ScaleLevel" FOREIGN KEY ("ScaleLevelID") REFERENCES __mj."RubricScaleLevel" (
    "ID"
  ),
  CONSTRAINT "UQ_RubricEvaluationScore_Criterion" UNIQUE (
    "EvaluationID",
    "CriterionID"
  ),
  CONSTRAINT "CK_RubricEvaluationScore_NotApplicableHasNoValue" CHECK ("IsNotApplicable" = FALSE
  OR (
    "ScaleLevelID" IS NULL AND "RawValue" IS NULL AND "NormalizedScore" IS NULL
  )),
  CONSTRAINT "CK_RubricEvaluationScore_Ranges" CHECK ((
    "NormalizedScore" IS NULL
    OR (
      "NormalizedScore" >= 0 AND "NormalizedScore" <= 1
    )
  )
  AND (
    "EffectiveWeight" IS NULL
    OR (
      "EffectiveWeight" >= 0 AND "EffectiveWeight" <= 1
    )
  )
  AND (
    "OverallContribution" IS NULL
    OR (
      "OverallContribution" >= 0 AND "OverallContribution" <= 1
    )
  )
  AND (
    "Completeness" IS NULL OR (
      "Completeness" >= 0 AND "Completeness" <= 1
    )
  )
  AND (
    "Confidence" IS NULL OR (
      "Confidence" >= 0 AND "Confidence" <= 1
    )
  ))
);

/* ════════════════════════════════════════════════════════════════════════════════════ */
/* 3. Consumers: agents and the testing framework */
/* ════════════════════════════════════════════════════════════════════════════════════ */
CREATE TABLE __mj."AIAgentRubric" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "AgentID" UUID NOT NULL,
  "RubricID" UUID NOT NULL,
  "Purpose" VARCHAR(30) NOT NULL,
  "IsDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  "PassThreshold" DECIMAL(9, 6) NULL,
  "SampleRate" DECIMAL(9, 6) NULL,
  "MaxSelfCheckAttempts" INT NULL,
  "EvaluatorConfig" TEXT NULL,
  "Sequence" INT NOT NULL DEFAULT (
    0
  ),
  CONSTRAINT "PK_AIAgentRubric" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AIAgentRubric_Agent" FOREIGN KEY ("AgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentRubric_Rubric" FOREIGN KEY ("RubricID") REFERENCES __mj."Rubric" (
    "ID"
  ),
  CONSTRAINT "UQ_AIAgentRubric_AgentRubricPurpose" UNIQUE (
    "AgentID",
    "RubricID",
    "Purpose"
  ),
  CONSTRAINT "CK_AIAgentRubric_Purpose" CHECK ("Purpose" IN ('Evaluation', 'SelfCheck', 'ProductionSampling')),
  CONSTRAINT "CK_AIAgentRubric_Status" CHECK ("Status" IN ('Active', 'Disabled')),
  CONSTRAINT "CK_AIAgentRubric_PassThreshold" CHECK ("PassThreshold" IS NULL OR (
    "PassThreshold" >= 0 AND "PassThreshold" <= 1
  )),
  CONSTRAINT "CK_AIAgentRubric_SampleRate" CHECK ("SampleRate" IS NULL OR (
    "SampleRate" >= 0 AND "SampleRate" <= 1
  )),
  CONSTRAINT "CK_AIAgentRubric_SamplingNeedsRate" CHECK ("Purpose" <> 'ProductionSampling' OR NOT "SampleRate" IS NULL),
  CONSTRAINT "CK_AIAgentRubric_MaxSelfCheckAttempts" CHECK ("MaxSelfCheckAttempts" IS NULL OR "MaxSelfCheckAttempts" >= 1)
);

ALTER TABLE __mj."Test"
  ADD COLUMN "RubricID" UUID NULL CONSTRAINT "FK_Test_Rubric" REFERENCES __mj."Rubric" (
    "ID"
  );

ALTER TABLE __mj."TestSuite"
  ADD COLUMN "RubricID" UUID NULL CONSTRAINT "FK_TestSuite_Rubric" REFERENCES __mj."Rubric" (
    "ID"
  );

ALTER TABLE __mj."TestSuiteRun"
  ADD COLUMN "Score" DECIMAL(9, 6) NULL CONSTRAINT "CK_TestSuiteRun_Score" CHECK ("Score" IS NULL OR (
    "Score" >= 0 AND "Score" <= 1
  ));

COMMENT ON TABLE __mj."RubricCategory" IS 'Hierarchical folders for organizing rubrics.';

COMMENT ON COLUMN __mj."RubricCategory"."Name" IS 'Display name of the category.';

COMMENT ON COLUMN __mj."RubricCategory"."Description" IS 'What rubrics in this category are for.';

COMMENT ON TABLE __mj."RubricScale" IS 'A reusable response scale that criteria are answered on: either ordered Levels (e.g. 1-5, Pass/Fail, Compliant/Partial/Non-compliant) or a Numeric range. Every answer is converted to a normalized 0..1 score. A scale used by a published rubric version is frozen in everything that affects scoring.';

COMMENT ON COLUMN __mj."RubricScale"."Name" IS 'Unique display name of the scale, e.g. "Likert 1-5" or "Compliance".';

COMMENT ON COLUMN __mj."RubricScale"."Description" IS 'What the scale measures and how evaluators should read it.';

COMMENT ON COLUMN __mj."RubricScale"."ScaleType" IS 'Levels: answers pick one of the scale''s RubricScaleLevel rows, each carrying its own normalized value. Numeric: answers are a number between MinValue and MaxValue, normalized linearly (inverted when HigherIsBetter = 0).';

COMMENT ON COLUMN __mj."RubricScale"."MinValue" IS 'Lowest allowed answer for a Numeric scale. Required when ScaleType = Numeric.';

COMMENT ON COLUMN __mj."RubricScale"."MaxValue" IS 'Highest allowed answer for a Numeric scale. Required when ScaleType = Numeric and must exceed MinValue.';

COMMENT ON COLUMN __mj."RubricScale"."Step" IS 'Optional input increment for a Numeric scale (e.g. 0.5). NULL = any value in range.';

COMMENT ON COLUMN __mj."RubricScale"."HigherIsBetter" IS 'For Numeric scales: 1 = a higher answer is better (normalizes to a higher score); 0 = lower is better (e.g. error counts), so normalization is inverted.';

COMMENT ON COLUMN __mj."RubricScale"."Status" IS 'Active scales can be chosen for new criteria; Disabled scales stay valid for versions that already use them.';

COMMENT ON TABLE __mj."RubricScaleLevel" IS 'One level of a Levels-type rubric scale.';

COMMENT ON COLUMN __mj."RubricScaleLevel"."Label" IS 'What evaluators see and pick, e.g. "Exceeds", "Partially compliant", "4".';

COMMENT ON COLUMN __mj."RubricScaleLevel"."Value" IS 'The level''s raw value in the scale''s own units, e.g. 4 on a 1-5 scale. Display and export only; scoring uses NormalizedValue.';

COMMENT ON COLUMN __mj."RubricScaleLevel"."NormalizedValue" IS 'The score this level contributes, from 0 (worst) to 1 (best). Explicit rather than derived so non-linear scales (e.g. Partial = 0.4) are expressible.';

COMMENT ON COLUMN __mj."RubricScaleLevel"."Description" IS 'Generic meaning of the level. Criteria can override it with their own anchor text (RubricCriterionLevel).';

COMMENT ON COLUMN __mj."RubricScaleLevel"."Sequence" IS 'Display order of the level within its scale, worst to best by convention.';

COMMENT ON TABLE __mj."Rubric" IS 'The stable identity of a rubric: weighted, nested criteria that records are evaluated against. The content lives in immutable, semantically versioned RubricVersion rows.';

COMMENT ON COLUMN __mj."Rubric"."Name" IS 'Unique display name of the rubric.';

COMMENT ON COLUMN __mj."Rubric"."Description" IS 'What the rubric evaluates and when to use it.';

COMMENT ON COLUMN __mj."Rubric"."Status" IS 'Active rubrics can be assigned and evaluated against; Disabled rubrics keep their history but are not offered for new use.';

COMMENT ON TABLE __mj."RubricVersion" IS 'An immutable-once-published snapshot of a rubric''s content. Edits happen on the single Draft; publishing freezes it and assigns a semantic version whose bump is computed by the server from a diff against the previous published version: Major = scores are not comparable (weights, scales, gates, tree shape, N/A policy, rollup, evaluator rules), Minor = scores comparable but verdicts or interpretation may differ (threshold, bands, advisory criteria, required evidence), Patch = wording only.';

COMMENT ON COLUMN __mj."RubricVersion"."MajorVersion" IS 'Semantic major version, assigned at publish. Evaluations sharing a rubric and major version are directly comparable. NULL while Draft.';

COMMENT ON COLUMN __mj."RubricVersion"."MinorVersion" IS 'Semantic minor version, assigned at publish. NULL while Draft.';

COMMENT ON COLUMN __mj."RubricVersion"."PatchVersion" IS 'Semantic patch version, assigned at publish. NULL while Draft.';

COMMENT ON COLUMN __mj."RubricVersion"."Status" IS 'Draft (editable, at most one per rubric), Published (frozen, available for new evaluations), or Retired (frozen, kept for history and for evaluations already pinned to it).';

COMMENT ON COLUMN __mj."RubricVersion"."BasedOnVersionID" IS 'The version this draft was cloned from; the publish-time diff and bump are computed against it.';

COMMENT ON COLUMN __mj."RubricVersion"."Instructions" IS 'Overall guidance for evaluators (human and AI) applying this version. Wording only: changing it is a patch.';

COMMENT ON COLUMN __mj."RubricVersion"."PassThreshold" IS 'Default minimum normalized score (0..1) for an evaluation to pass. Consumers (a test, a review round) may override it; the threshold actually used is stored on each evaluation. NULL = no threshold (evaluations report a score and gate results only).';

COMMENT ON COLUMN __mj."RubricVersion"."MinimumCompleteness" IS 'Minimum share (0..1) of applicable scored criteria required for a valid result. Below it the evaluation''s Outcome is Incomplete and it does not pass. NULL = no minimum.';

COMMENT ON COLUMN __mj."RubricVersion"."NotApplicablePolicy" IS 'Default handling of a criterion answered Not Applicable (criteria may override): ExcludeAndRedistribute (drop it and share its weight among its siblings), CountAsZero (score it 0), FailEvaluation (allowed, but the evaluation fails), NotAllowed (the evaluation cannot be submitted).';

COMMENT ON COLUMN __mj."RubricVersion"."ScoreDisplayMin" IS 'Display-only lower bound: the value a normalized score of 0 is shown as (e.g. 0 or 1). Never used in scoring.';

COMMENT ON COLUMN __mj."RubricVersion"."ScoreDisplayMax" IS 'Display-only upper bound: the value a normalized score of 1 is shown as (e.g. 100 or 5). Never used in scoring.';

COMMENT ON COLUMN __mj."RubricVersion"."RequestedBump" IS 'Optional bump the author asks for on publish. The server applies the larger of this and the bump it computes; an author can never publish a smaller bump than the change requires.';

COMMENT ON COLUMN __mj."RubricVersion"."ComputedBump" IS 'The bump the server computed from the diff at publish (Initial for a rubric''s first version).';

COMMENT ON COLUMN __mj."RubricVersion"."AppliedBump" IS 'The bump actually applied at publish: the larger of ComputedBump and RequestedBump.';

COMMENT ON COLUMN __mj."RubricVersion"."ChangeSummary" IS 'Author''s human-readable summary of what changed in this version.';

COMMENT ON COLUMN __mj."RubricVersion"."ChangeDetails" IS 'JSON diff produced at publish: every added, removed and changed node and property, each with the bump it required. Explains ComputedBump.';

COMMENT ON COLUMN __mj."RubricVersion"."ContentHash" IS 'SHA-256 of the version''s full canonical content (scoring math plus all wording), computed at publish.';

COMMENT ON COLUMN __mj."RubricVersion"."ScoringHash" IS 'SHA-256 of only the scoring-relevant content (tree shape, keys, weights, scales, gates, policies, rollups, evaluator rules). Two versions with equal ScoringHash compute identical scores from identical answers.';

COMMENT ON COLUMN __mj."RubricVersion"."PublishedAt" IS 'When the version was published.';

COMMENT ON COLUMN __mj."RubricVersion"."RetiredAt" IS 'When the version was retired. NULL while Draft or Published.';

COMMENT ON TABLE __mj."RubricCriterion" IS 'A node in a rubric version''s weighted tree. Groups roll up their children; criteria (leaves) are answered on a scale. Weights are relative among siblings, so a node''s share of the total is the product of its and its ancestors'' normalized weights.';

COMMENT ON COLUMN __mj."RubricCriterion"."ParentID" IS 'Parent group node. NULL = a top-level node of the rubric.';

COMMENT ON COLUMN __mj."RubricCriterion"."Key" IS 'Stable machine key, unique within the version and carried unchanged across versions. It is the criterion''s identity for comparing and aggregating results over time; renaming it is a removal plus an addition (a major bump).';

COMMENT ON COLUMN __mj."RubricCriterion"."Name" IS 'Display name of the group or criterion.';

COMMENT ON COLUMN __mj."RubricCriterion"."Description" IS 'What the node covers.';

COMMENT ON COLUMN __mj."RubricCriterion"."Guidance" IS 'Instructions to evaluators (human and AI) on how to judge this criterion and what evidence counts.';

COMMENT ON COLUMN __mj."RubricCriterion"."NodeType" IS 'Group: has children, no scale, and a computed score. Criterion: a leaf answered on ScaleID.';

COMMENT ON COLUMN __mj."RubricCriterion"."Weight" IS 'Relative weight among siblings (normalized within the parent at scoring time). Must be >= 0.';

COMMENT ON COLUMN __mj."RubricCriterion"."IsAdvisory" IS '1 = recorded and displayed but excluded from every score, gate and pass decision.';

COMMENT ON COLUMN __mj."RubricCriterion"."IsGate" IS '1 = knockout: if this node''s normalized score is below GateMinimumScore the whole evaluation fails, whatever its overall score. Also applies to groups.';

COMMENT ON COLUMN __mj."RubricCriterion"."GateMinimumScore" IS 'Normalized score (0..1) a gate node must reach. Required when IsGate = 1.';

COMMENT ON COLUMN __mj."RubricCriterion"."NotApplicablePolicy" IS 'Overrides the version''s NotApplicablePolicy for this node. NULL = inherit.';

COMMENT ON COLUMN __mj."RubricCriterion"."RollupMethod" IS 'How a group combines its children''s scores: WeightedMean (default when NULL), Minimum (weakest child), or Maximum (strongest child). Groups only.';

COMMENT ON COLUMN __mj."RubricCriterion"."EvidenceRequired" IS '1 = an evaluation cannot be submitted without evidence for this criterion.';

COMMENT ON COLUMN __mj."RubricCriterion"."RationaleRequired" IS '1 = an evaluation cannot be submitted without a written rationale for this criterion.';

COMMENT ON COLUMN __mj."RubricCriterion"."Sequence" IS 'Display order among siblings.';

COMMENT ON COLUMN __mj."RubricCriterion"."EvaluatorConfig" IS 'JSON (IRubricCriterionEvaluatorConfig) of evaluator-specific settings, keyed by evaluator: e.g. a deterministic rule, or hints for AI judges. Changes are treated as scoring changes (major bump) because a deterministic rule decides the score.';

COMMENT ON TABLE __mj."RubricCriterionLevel" IS 'Criterion-specific anchor text: what a given level (or numeric value) looks like for THIS criterion, e.g. what "4 - Strong" means for Methodology.';

COMMENT ON COLUMN __mj."RubricCriterionLevel"."ScaleLevelID" IS 'The Levels-scale level this anchor describes. Exactly one of ScaleLevelID and AnchorValue is set.';

COMMENT ON COLUMN __mj."RubricCriterionLevel"."AnchorValue" IS 'For a Numeric scale: the value this anchor describes (e.g. 0, 50, 100).';

COMMENT ON COLUMN __mj."RubricCriterionLevel"."Descriptor" IS 'The anchor text shown to evaluators and given to AI judges.';

COMMENT ON TABLE __mj."RubricBand" IS 'A labeled range of the normalized score, e.g. Exemplary / Proficient / Developing. Display and reporting ONLY: bands never decide pass or fail, which is always PassThreshold plus gates.';

COMMENT ON COLUMN __mj."RubricBand"."Label" IS 'Display label of the band.';

COMMENT ON COLUMN __mj."RubricBand"."Description" IS 'What a result in this band means.';

COMMENT ON COLUMN __mj."RubricBand"."MinScore" IS 'Inclusive lower bound of the band on the 0..1 normalized scale.';

COMMENT ON COLUMN __mj."RubricBand"."MaxScore" IS 'Exclusive upper bound of the band on the 0..1 normalized scale; the highest band also includes 1.';

COMMENT ON COLUMN __mj."RubricBand"."DisplayTone" IS 'Semantic tone the UI maps to design tokens (never a raw color).';

COMMENT ON COLUMN __mj."RubricBand"."Sequence" IS 'Display order of the band.';

COMMENT ON TABLE __mj."RubricEvaluation" IS 'One evaluator''s judgment of one record (the subject) against one pinned rubric version. Editable while Draft; on submit the server computes and stores the result once, after which the row is immutable. Several evaluations of the same subject in the same context form a cohort whose consensus is exposed by the base view.';

COMMENT ON COLUMN __mj."RubricEvaluation"."SubjectEntityID" IS 'The entity of the record being evaluated (a test run, an agent run, a submission, a vendor response, ...).';

COMMENT ON COLUMN __mj."RubricEvaluation"."SubjectRecordID" IS 'Primary key of the record being evaluated, in MemberJunction''s composite-key string form.';

COMMENT ON COLUMN __mj."RubricEvaluation"."ContextEntityID" IS 'Optional entity of the record that asked for this evaluation (a test, a review round, a workflow step). Evaluations share a consensus cohort only when their context matches.';

COMMENT ON COLUMN __mj."RubricEvaluation"."ContextRecordID" IS 'Primary key of the context record. Set together with ContextEntityID or not at all.';

COMMENT ON COLUMN __mj."RubricEvaluation"."EvaluatorType" IS 'Who judged: Human (a user), AIPrompt (an LLM judge), Agent (an agent that may use tools), Deterministic (rules), Self (the subject''s own party, e.g. a vendor asserting compliance; excluded from reviewer consensus), External (imported from another system).';

COMMENT ON COLUMN __mj."RubricEvaluation"."EvaluatorUserID" IS 'The user who evaluated. Required for Human; the responding user for Self.';

COMMENT ON COLUMN __mj."RubricEvaluation"."AIPromptRunID" IS 'The prompt run that produced an AIPrompt evaluation (model, cost, raw output).';

COMMENT ON COLUMN __mj."RubricEvaluation"."AIAgentRunID" IS 'The agent run that produced an Agent evaluation.';

COMMENT ON COLUMN __mj."RubricEvaluation"."EvaluatorName" IS 'Name of the evaluator implementation or external source (e.g. the evaluator driver class) for provenance.';

COMMENT ON COLUMN __mj."RubricEvaluation"."Status" IS 'Draft (being filled in), Submitted (final, counted in consensus), Superseded (replaced by a newer evaluation), Withdrawn (retracted, e.g. a conflict of interest), Failed (the evaluator errored; see ErrorMessage).';

COMMENT ON COLUMN __mj."RubricEvaluation"."SupersedesEvaluationID" IS 'The earlier evaluation this one corrects. Submitting this one moves that one to Superseded.';

COMMENT ON COLUMN __mj."RubricEvaluation"."SubmittedAt" IS 'When the evaluation was submitted and its result computed.';

COMMENT ON COLUMN __mj."RubricEvaluation"."PassThresholdApplied" IS 'The pass threshold used to compute Passed (the version default or a consumer override). Stored so a later change to either never rewrites history.';

COMMENT ON COLUMN __mj."RubricEvaluation"."NormalizedScore" IS 'Overall score, 0..1, computed once at submit from the score rows. NULL if nothing applicable was scored.';

COMMENT ON COLUMN __mj."RubricEvaluation"."Passed" IS 'Computed verdict: 1 = passed, 0 = failed, NULL = no threshold applied and no gate or N/A failure (Outcome = Scored).';

COMMENT ON COLUMN __mj."RubricEvaluation"."Outcome" IS 'Why the evaluation ended as it did: Passed, BelowThreshold, GateFailed, NotApplicableFailure, Incomplete (below MinimumCompleteness or nothing scored), or Scored (no threshold to judge against).';

COMMENT ON COLUMN __mj."RubricEvaluation"."BandID" IS 'The band NormalizedScore falls in, for display. Interpretation only.';

COMMENT ON COLUMN __mj."RubricEvaluation"."GateFailed" IS '1 = at least one gate node scored below its GateMinimumScore.';

COMMENT ON COLUMN __mj."RubricEvaluation"."Completeness" IS 'Share (0..1) of applicable, non-advisory criteria that were scored.';

COMMENT ON COLUMN __mj."RubricEvaluation"."ScoredCriteriaCount" IS 'Number of non-advisory criteria that received a score.';

COMMENT ON COLUMN __mj."RubricEvaluation"."ApplicableCriteriaCount" IS 'Number of non-advisory criteria not answered Not Applicable.';

COMMENT ON COLUMN __mj."RubricEvaluation"."TotalCriteriaCount" IS 'Number of non-advisory criteria (leaves) in the version.';

COMMENT ON COLUMN __mj."RubricEvaluation"."Confidence" IS 'Evaluator''s overall confidence (0..1), typically the weighted mean of per-criterion confidences from an AI judge. NULL for evaluators that do not report one.';

COMMENT ON COLUMN __mj."RubricEvaluation"."Narrative" IS 'The evaluator''s overall written assessment.';

COMMENT ON COLUMN __mj."RubricEvaluation"."ErrorMessage" IS 'Why the evaluator failed, when Status = Failed.';

COMMENT ON COLUMN __mj."RubricEvaluation"."ScoringEngineVersion" IS 'Version of the scoring algorithm that computed the stored result, so a future algorithm change is visible rather than silent.';

COMMENT ON COLUMN __mj."RubricEvaluation"."Metadata" IS 'JSON (IRubricEvaluationMetadata) of evaluator provenance not covered by columns: model settings, timings, the consumer that requested it.';

COMMENT ON TABLE __mj."RubricEvaluationScore" IS 'One node of one evaluation: an evaluator''s answer to a criterion, or (IsComputed = 1) a group''s computed rollup. Writable only while the evaluation is a Draft.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."ScaleLevelID" IS 'The level chosen, for a criterion on a Levels scale.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."RawValue" IS 'The number entered, for a criterion on a Numeric scale.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."IsNotApplicable" IS '1 = the evaluator judged this criterion not applicable to the subject; handled per the effective NotApplicablePolicy.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."IsComputed" IS '1 = a group rollup written by the server at submit, not an evaluator''s answer.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."NormalizedScore" IS 'The node''s score on the 0..1 scale: the answer normalized through its scale, or the group rollup.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."EffectiveWeight" IS 'The node''s share of its parent (0..1) after Not Applicable redistribution.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."OverallContribution" IS 'Points this node contributed to the evaluation''s overall NormalizedScore (its score times the product of effective weights to the root). Leaves'' contributions sum to the overall score under weighted-mean rollups.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."GateFailed" IS '1 = this node is a gate and scored below its GateMinimumScore.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."Completeness" IS 'For group rows: share (0..1) of applicable descendant criteria that were scored.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."Confidence" IS 'Evaluator''s confidence in this answer (0..1), e.g. from an AI judge''s level probabilities. Low confidence can route the criterion to a human.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."Rationale" IS 'The evaluator''s reasoning for this answer.';

COMMENT ON COLUMN __mj."RubricEvaluationScore"."Evidence" IS 'JSON array (IRubricEvidence[]) of evidence items: quotes with spans, conversation turns, file references, URLs, record references.';

COMMENT ON TABLE __mj."AIAgentRubric" IS 'A rubric an agent publishes for how it should be judged: Evaluation (used by agent eval tests), SelfCheck (the agent checks its own output before returning), or ProductionSampling (a share of real runs is evaluated asynchronously to watch for drift).';

COMMENT ON COLUMN __mj."AIAgentRubric"."Purpose" IS 'How the agent uses the rubric: Evaluation, SelfCheck or ProductionSampling.';

COMMENT ON COLUMN __mj."AIAgentRubric"."IsDefault" IS '1 = the rubric used for this purpose when a caller does not name one.';

COMMENT ON COLUMN __mj."AIAgentRubric"."Status" IS 'Active links are used; Disabled links are kept but ignored.';

COMMENT ON COLUMN __mj."AIAgentRubric"."PassThreshold" IS 'Overrides the rubric version''s PassThreshold (0..1) for this agent and purpose. NULL = use the version default.';

COMMENT ON COLUMN __mj."AIAgentRubric"."SampleRate" IS 'Share (0..1) of completed production runs to evaluate. Required for ProductionSampling. Sampling is deterministic on the run ID so it is reproducible.';

COMMENT ON COLUMN __mj."AIAgentRubric"."MaxSelfCheckAttempts" IS 'For SelfCheck: how many times the agent may revise its output after a failed self-check before returning anyway (with the failure recorded). NULL = 1.';

COMMENT ON COLUMN __mj."AIAgentRubric"."EvaluatorConfig" IS 'JSON (IRubricEvaluatorSelection) naming which evaluator to use and its settings (e.g. judge prompt, model), overriding the defaults.';

COMMENT ON COLUMN __mj."AIAgentRubric"."Sequence" IS 'Display and evaluation order when an agent has several rubrics for one purpose.';

COMMENT ON COLUMN __mj."Test"."RubricID" IS 'The rubric this test''s output is judged by. NULL = inherit from the suite (walking up ParentID). The latest published version is pinned when each run starts.';

COMMENT ON COLUMN __mj."TestSuite"."RubricID" IS 'Default rubric for tests in this suite and its child suites that do not name their own.';

COMMENT ON COLUMN __mj."TestSuiteRun"."Score" IS 'Suite-level score (0..1): the mean score of the suite''s executed (non-skipped) test runs.';

/* ===================================================================================== */
/* ===================================================================================== */
/* ===================================================================================== */
/* ===================================================================================== */
/* ===================================================================================== */
/* ===================================================================================== */
-- ════════════════════════════════════════════════════════════════════════════════════
-- 4. Immutability backstop triggers — hand-ported from the SQL Server source.
--
-- The SQL Server triggers are statement-level and compare the inserted/deleted sets; these are
-- row-level, which gives the same result one row at a time. Column comparisons use
-- IS DISTINCT FROM, which treats NULL = NULL exactly as the source's EXCEPT does. They reference
-- only the business columns, never __mj_UpdatedAt, so CodeGen's timestamp trigger is never blocked.
-- PostgreSQL has no INSTEAD OF trigger on a table, so trgRubricVersion_Delete is a BEFORE DELETE
-- trigger that clears the version's tree, leaves first, and then lets the delete proceed.
-- Every object is dropped first so the migration is re-runnable.
-- ════════════════════════════════════════════════════════════════════════════════════

-- 4a. A published or retired version is frozen, except for moving between Published and Retired.
CREATE OR REPLACE FUNCTION __mj."trgRubricVersion_Immutable_fn"() RETURNS TRIGGER AS $$
BEGIN
    IF OLD."Status" = 'Draft' THEN
        RETURN NULL;
    END IF;
    IF NEW."Status" = 'Draft'
       OR (OLD."RubricID", OLD."MajorVersion", OLD."MinorVersion", OLD."PatchVersion", OLD."BasedOnVersionID",
           OLD."Instructions", OLD."PassThreshold", OLD."MinimumCompleteness", OLD."NotApplicablePolicy",
           OLD."ScoreDisplayMin", OLD."ScoreDisplayMax", OLD."RequestedBump", OLD."ComputedBump", OLD."AppliedBump",
           OLD."ChangeSummary", OLD."ChangeDetails", OLD."ContentHash", OLD."ScoringHash",
           OLD."PublishedAt", OLD."PublishedByUserID")
          IS DISTINCT FROM
          (NEW."RubricID", NEW."MajorVersion", NEW."MinorVersion", NEW."PatchVersion", NEW."BasedOnVersionID",
           NEW."Instructions", NEW."PassThreshold", NEW."MinimumCompleteness", NEW."NotApplicablePolicy",
           NEW."ScoreDisplayMin", NEW."ScoreDisplayMax", NEW."RequestedBump", NEW."ComputedBump", NEW."AppliedBump",
           NEW."ChangeSummary", NEW."ChangeDetails", NEW."ContentHash", NEW."ScoringHash",
           NEW."PublishedAt", NEW."PublishedByUserID")
    THEN
        RAISE EXCEPTION 'A published rubric version is immutable. Create a new draft version to change it; only its Status may move between Published and Retired.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trgRubricVersion_Immutable" ON __mj."RubricVersion";
CREATE TRIGGER "trgRubricVersion_Immutable" AFTER UPDATE ON __mj."RubricVersion"
    FOR EACH ROW EXECUTE FUNCTION __mj."trgRubricVersion_Immutable_fn"();

-- 4a2. Delete a draft version and the tree that hangs off it.
CREATE OR REPLACE FUNCTION __mj."trgRubricVersion_Delete_fn"() RETURNS TRIGGER AS $$
BEGIN
    IF OLD."Status" <> 'Draft' THEN
        RAISE EXCEPTION 'A published or retired rubric version cannot be deleted.';
    END IF;

    DELETE FROM __mj."RubricEvaluationScore" sc
     USING __mj."RubricEvaluation" e
     WHERE e."ID" = sc."EvaluationID" AND e."RubricVersionID" = OLD."ID" AND e."Status" = 'Draft';

    DELETE FROM __mj."RubricEvaluation" e
     WHERE e."RubricVersionID" = OLD."ID" AND e."Status" = 'Draft';

    DELETE FROM __mj."RubricCriterionLevel" cl
     USING __mj."RubricCriterion" c
     WHERE c."ID" = cl."CriterionID" AND c."RubricVersionID" = OLD."ID";

    UPDATE __mj."RubricCriterion" SET "ParentID" = NULL
     WHERE "RubricVersionID" = OLD."ID" AND "ParentID" IS NOT NULL;

    DELETE FROM __mj."RubricCriterion" WHERE "RubricVersionID" = OLD."ID";

    DELETE FROM __mj."RubricBand" WHERE "RubricVersionID" = OLD."ID";

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trgRubricVersion_Delete" ON __mj."RubricVersion";
CREATE TRIGGER "trgRubricVersion_Delete" BEFORE DELETE ON __mj."RubricVersion"
    FOR EACH ROW EXECUTE FUNCTION __mj."trgRubricVersion_Delete_fn"();

-- 4b. Criteria of a non-draft version are frozen.
CREATE OR REPLACE FUNCTION __mj."trgRubricCriterion_Immutable_fn"() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM __mj."RubricVersion" v
         WHERE v."Status" <> 'Draft'
           AND v."ID" IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD."RubricVersionID" END,
                          CASE WHEN TG_OP <> 'DELETE' THEN NEW."RubricVersionID" END)
    ) THEN
        RAISE EXCEPTION 'Criteria of a published rubric version cannot be added, changed or removed. Create a new draft version.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trgRubricCriterion_Immutable" ON __mj."RubricCriterion";
CREATE TRIGGER "trgRubricCriterion_Immutable" AFTER INSERT OR UPDATE OR DELETE ON __mj."RubricCriterion"
    FOR EACH ROW EXECUTE FUNCTION __mj."trgRubricCriterion_Immutable_fn"();

-- 4c. Level descriptors of a non-draft version are frozen.
CREATE OR REPLACE FUNCTION __mj."trgRubricCriterionLevel_Immutable_fn"() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM __mj."RubricCriterion" c
         INNER JOIN __mj."RubricVersion" v ON v."ID" = c."RubricVersionID"
         WHERE v."Status" <> 'Draft'
           AND c."ID" IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD."CriterionID" END,
                          CASE WHEN TG_OP <> 'DELETE' THEN NEW."CriterionID" END)
    ) THEN
        RAISE EXCEPTION 'Level descriptors of a published rubric version cannot be added, changed or removed. Create a new draft version.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trgRubricCriterionLevel_Immutable" ON __mj."RubricCriterionLevel";
CREATE TRIGGER "trgRubricCriterionLevel_Immutable" AFTER INSERT OR UPDATE OR DELETE ON __mj."RubricCriterionLevel"
    FOR EACH ROW EXECUTE FUNCTION __mj."trgRubricCriterionLevel_Immutable_fn"();

-- 4d. Bands of a non-draft version are frozen.
CREATE OR REPLACE FUNCTION __mj."trgRubricBand_Immutable_fn"() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM __mj."RubricVersion" v
         WHERE v."Status" <> 'Draft'
           AND v."ID" IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD."RubricVersionID" END,
                          CASE WHEN TG_OP <> 'DELETE' THEN NEW."RubricVersionID" END)
    ) THEN
        RAISE EXCEPTION 'Bands of a published rubric version cannot be added, changed or removed. Create a new draft version.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trgRubricBand_Immutable" ON __mj."RubricBand";
CREATE TRIGGER "trgRubricBand_Immutable" AFTER INSERT OR UPDATE OR DELETE ON __mj."RubricBand"
    FOR EACH ROW EXECUTE FUNCTION __mj."trgRubricBand_Immutable_fn"();

-- 4e. A scale used by a published version is frozen in everything that affects scoring.
CREATE OR REPLACE FUNCTION __mj."trgRubricScale_Immutable_fn"() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM __mj."RubricCriterion" c
         INNER JOIN __mj."RubricVersion" v ON v."ID" = c."RubricVersionID"
         WHERE c."ScaleID" = OLD."ID" AND v."Status" <> 'Draft'
    )
    AND (
        TG_OP = 'DELETE'
        OR (OLD."ScaleType", OLD."MinValue", OLD."MaxValue", OLD."Step", OLD."HigherIsBetter")
           IS DISTINCT FROM
           (NEW."ScaleType", NEW."MinValue", NEW."MaxValue", NEW."Step", NEW."HigherIsBetter")
    ) THEN
        RAISE EXCEPTION 'This scale is used by a published rubric version; its type, range and direction cannot change and it cannot be deleted. Create a new scale instead.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trgRubricScale_Immutable" ON __mj."RubricScale";
CREATE TRIGGER "trgRubricScale_Immutable" AFTER UPDATE OR DELETE ON __mj."RubricScale"
    FOR EACH ROW EXECUTE FUNCTION __mj."trgRubricScale_Immutable_fn"();

-- Description is display text; everything else about a level is part of the scoring math.
CREATE OR REPLACE FUNCTION __mj."trgRubricScaleLevel_Immutable_fn"() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM __mj."RubricCriterion" c
         INNER JOIN __mj."RubricVersion" v ON v."ID" = c."RubricVersionID"
         WHERE v."Status" <> 'Draft'
           AND c."ScaleID" IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD."ScaleID" END,
                               CASE WHEN TG_OP <> 'DELETE' THEN NEW."ScaleID" END)
    )
    AND (
        TG_OP IN ('INSERT', 'DELETE')
        OR (OLD."ID", OLD."ScaleID", OLD."Label", OLD."Value", OLD."NormalizedValue", OLD."Sequence")
           IS DISTINCT FROM
           (NEW."ID", NEW."ScaleID", NEW."Label", NEW."Value", NEW."NormalizedValue", NEW."Sequence")
    ) THEN
        RAISE EXCEPTION 'This scale is used by a published rubric version; its levels cannot be added, changed or removed (descriptions may be edited). Create a new scale instead.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trgRubricScaleLevel_Immutable" ON __mj."RubricScaleLevel";
CREATE TRIGGER "trgRubricScaleLevel_Immutable" AFTER INSERT OR UPDATE OR DELETE ON __mj."RubricScaleLevel"
    FOR EACH ROW EXECUTE FUNCTION __mj."trgRubricScaleLevel_Immutable_fn"();

-- 4f. A submitted evaluation is frozen. Its only permitted changes are Status moving
--     Submitted -> Superseded or Submitted -> Withdrawn, and clearing AIAgentRunID or AIPromptRunID.
CREATE OR REPLACE FUNCTION __mj."trgRubricEvaluation_Immutable_fn"() RETURNS TRIGGER AS $$
BEGIN
    IF OLD."Status" = 'Draft' THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A submitted rubric evaluation cannot be deleted. Supersede or withdraw it instead.';
    END IF;
    IF NOT (NEW."Status" = OLD."Status"
            OR (OLD."Status" = 'Submitted' AND NEW."Status" IN ('Superseded', 'Withdrawn')))
       OR (OLD."RubricVersionID", OLD."SubjectEntityID", OLD."SubjectRecordID", OLD."ContextEntityID", OLD."ContextRecordID",
           OLD."EvaluatorType", OLD."EvaluatorUserID", OLD."EvaluatorName",
           OLD."SupersedesEvaluationID", OLD."SubmittedAt", OLD."PassThresholdApplied", OLD."NormalizedScore", OLD."Passed",
           OLD."Outcome", OLD."BandID", OLD."GateFailed", OLD."Completeness", OLD."ScoredCriteriaCount",
           OLD."ApplicableCriteriaCount", OLD."TotalCriteriaCount", OLD."Confidence", OLD."Narrative", OLD."ErrorMessage",
           OLD."ScoringEngineVersion", OLD."Metadata")
          IS DISTINCT FROM
          (NEW."RubricVersionID", NEW."SubjectEntityID", NEW."SubjectRecordID", NEW."ContextEntityID", NEW."ContextRecordID",
           NEW."EvaluatorType", NEW."EvaluatorUserID", NEW."EvaluatorName",
           NEW."SupersedesEvaluationID", NEW."SubmittedAt", NEW."PassThresholdApplied", NEW."NormalizedScore", NEW."Passed",
           NEW."Outcome", NEW."BandID", NEW."GateFailed", NEW."Completeness", NEW."ScoredCriteriaCount",
           NEW."ApplicableCriteriaCount", NEW."TotalCriteriaCount", NEW."Confidence", NEW."Narrative", NEW."ErrorMessage",
           NEW."ScoringEngineVersion", NEW."Metadata")
       OR (NEW."AIAgentRunID" IS NOT NULL AND NEW."AIAgentRunID" IS DISTINCT FROM OLD."AIAgentRunID")
       OR (NEW."AIPromptRunID" IS NOT NULL AND NEW."AIPromptRunID" IS DISTINCT FROM OLD."AIPromptRunID")
    THEN
        RAISE EXCEPTION 'A submitted rubric evaluation is immutable. To correct it, create a new evaluation that supersedes it.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trgRubricEvaluation_Immutable" ON __mj."RubricEvaluation";
CREATE TRIGGER "trgRubricEvaluation_Immutable" AFTER UPDATE OR DELETE ON __mj."RubricEvaluation"
    FOR EACH ROW EXECUTE FUNCTION __mj."trgRubricEvaluation_Immutable_fn"();

-- 4g. Score rows belong to their evaluation's lifecycle: writable only while it is a Draft.
CREATE OR REPLACE FUNCTION __mj."trgRubricEvaluationScore_Immutable_fn"() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM __mj."RubricEvaluation" e
         WHERE e."Status" <> 'Draft'
           AND e."ID" IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD."EvaluationID" END,
                          CASE WHEN TG_OP <> 'DELETE' THEN NEW."EvaluationID" END)
    ) THEN
        RAISE EXCEPTION 'Scores of a submitted rubric evaluation cannot be added, changed or removed.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "trgRubricEvaluationScore_Immutable" ON __mj."RubricEvaluationScore";
CREATE TRIGGER "trgRubricEvaluationScore_Immutable" AFTER INSERT OR UPDATE OR DELETE ON __mj."RubricEvaluationScore"
    FOR EACH ROW EXECUTE FUNCTION __mj."trgRubricEvaluationScore_Immutable_fn"();


/* ==  EVERYTHING BELOW THIS BANNER WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL  == */
/* ==  Pass 1, 2026-10-01, MJ_6_2_CLEAN_pr4937_recapture2. Base view is vwRubricCriteria. */
/* ==  DO NOT EDIT BY HAND. Replace this section wholesale on the next capture.      == */
/* ===================================================================================== */
/* ===================================================================================== */
/* SQL generated to create new entity MJ: Rubric Criteria */
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
    '49d89cdd-b89f-45d7-a5bb-04fc1c10e71d',
    'MJ: Rubric Criteria',
    'Rubric Criteria',
    'A node in a rubric version''s weighted tree. Groups roll up their children; criteria (leaves) are answered on a scale. Weights are relative among siblings, so a node''s share of the total is the product of its and its ancestors'' normalized weights.',
    NULL,
    'RubricCriterion',
    'vwRubricCriteria',
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
/* SQL generated to add new entity MJ: Rubric Criteria to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '49d89cdd-b89f-45d7-a5bb-04fc1c10e71d',
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
/* SQL generated to add new permission for entity MJ: Rubric Criteria for role UI */
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
  CAST('49d89cdd-b89f-45d7-a5bb-04fc1c10e71d' AS UUID),
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
      "EntityID" = CAST('49d89cdd-b89f-45d7-a5bb-04fc1c10e71d' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Criteria for role Developer */
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
  CAST('49d89cdd-b89f-45d7-a5bb-04fc1c10e71d' AS UUID),
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
      "EntityID" = CAST('49d89cdd-b89f-45d7-a5bb-04fc1c10e71d' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Criteria for role Integration */
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
  CAST('49d89cdd-b89f-45d7-a5bb-04fc1c10e71d' AS UUID),
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
      "EntityID" = CAST('49d89cdd-b89f-45d7-a5bb-04fc1c10e71d' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Rubric Criterion Levels */
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
    'ecbad01d-21ed-4759-ab7f-4d7f118a49d7',
    'MJ: Rubric Criterion Levels',
    'Rubric Criterion Levels',
    'Criterion-specific anchor text: what a given level (or numeric value) looks like for THIS criterion, e.g. what "4 - Strong" means for Methodology.',
    NULL,
    'RubricCriterionLevel',
    'vwRubricCriterionLevels',
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
/* SQL generated to add new entity MJ: Rubric Criterion Levels to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'ecbad01d-21ed-4759-ab7f-4d7f118a49d7',
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
/* SQL generated to add new permission for entity MJ: Rubric Criterion Levels for role UI */
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
  CAST('ecbad01d-21ed-4759-ab7f-4d7f118a49d7' AS UUID),
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
      "EntityID" = CAST('ecbad01d-21ed-4759-ab7f-4d7f118a49d7' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Criterion Levels for role Developer */
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
  CAST('ecbad01d-21ed-4759-ab7f-4d7f118a49d7' AS UUID),
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
      "EntityID" = CAST('ecbad01d-21ed-4759-ab7f-4d7f118a49d7' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Criterion Levels for role Integration */
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
  CAST('ecbad01d-21ed-4759-ab7f-4d7f118a49d7' AS UUID),
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
      "EntityID" = CAST('ecbad01d-21ed-4759-ab7f-4d7f118a49d7' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Rubric Bands */
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
    'e3fe5c3c-ef45-4cb5-b806-03e4ddbfb107',
    'MJ: Rubric Bands',
    'Rubric Bands',
    'A labeled range of the normalized score, e.g. Exemplary / Proficient / Developing. Display and reporting ONLY: bands never decide pass or fail, which is always PassThreshold plus gates.',
    NULL,
    'RubricBand',
    'vwRubricBands',
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
/* SQL generated to add new entity MJ: Rubric Bands to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'e3fe5c3c-ef45-4cb5-b806-03e4ddbfb107',
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
/* SQL generated to add new permission for entity MJ: Rubric Bands for role UI */
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
  CAST('e3fe5c3c-ef45-4cb5-b806-03e4ddbfb107' AS UUID),
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
      "EntityID" = CAST('e3fe5c3c-ef45-4cb5-b806-03e4ddbfb107' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Bands for role Developer */
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
  CAST('e3fe5c3c-ef45-4cb5-b806-03e4ddbfb107' AS UUID),
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
      "EntityID" = CAST('e3fe5c3c-ef45-4cb5-b806-03e4ddbfb107' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Bands for role Integration */
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
  CAST('e3fe5c3c-ef45-4cb5-b806-03e4ddbfb107' AS UUID),
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
      "EntityID" = CAST('e3fe5c3c-ef45-4cb5-b806-03e4ddbfb107' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Rubric Evaluations */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "BaseViewGenerated",
  "GeneratedBaseViewName",
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
    '7faa091d-c1a3-48a7-82d2-3d17729470f9',
    'MJ: Rubric Evaluations',
    'Rubric Evaluations',
    'One evaluator''s judgment of one record (the subject) against one pinned rubric version. Editable while Draft; on submit the server computes and stores the result once, after which the row is immutable. Several evaluations of the same subject in the same context form a cohort whose consensus is exposed by the base view.',
    NULL,
    'RubricEvaluation',
    'vwRubricEvaluations',
    FALSE,
    'vwRubricEvaluationsGenerated',
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
/* SQL generated to add new entity MJ: Rubric Evaluations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '7faa091d-c1a3-48a7-82d2-3d17729470f9',
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
/* SQL generated to add new permission for entity MJ: Rubric Evaluations for role UI */
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
  CAST('7faa091d-c1a3-48a7-82d2-3d17729470f9' AS UUID),
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
      "EntityID" = CAST('7faa091d-c1a3-48a7-82d2-3d17729470f9' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Evaluations for role Developer */
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
  CAST('7faa091d-c1a3-48a7-82d2-3d17729470f9' AS UUID),
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
      "EntityID" = CAST('7faa091d-c1a3-48a7-82d2-3d17729470f9' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Evaluations for role Integration */
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
  CAST('7faa091d-c1a3-48a7-82d2-3d17729470f9' AS UUID),
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
      "EntityID" = CAST('7faa091d-c1a3-48a7-82d2-3d17729470f9' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Rubric Evaluation Scores */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "BaseViewGenerated",
  "GeneratedBaseViewName",
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
    '122ed707-2bc0-42e8-b25f-6bdde7164962',
    'MJ: Rubric Evaluation Scores',
    'Rubric Evaluation Scores',
    'One node of one evaluation: an evaluator''s answer to a criterion, or (IsComputed = 1) a group''s computed rollup. Writable only while the evaluation is a Draft.',
    NULL,
    'RubricEvaluationScore',
    'vwRubricEvaluationScores',
    FALSE,
    'vwRubricEvaluationScoresGenerated',
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
/* SQL generated to add new entity MJ: Rubric Evaluation Scores to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '122ed707-2bc0-42e8-b25f-6bdde7164962',
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
/* SQL generated to add new permission for entity MJ: Rubric Evaluation Scores for role UI */
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
  CAST('122ed707-2bc0-42e8-b25f-6bdde7164962' AS UUID),
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
      "EntityID" = CAST('122ed707-2bc0-42e8-b25f-6bdde7164962' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Evaluation Scores for role Developer */
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
  CAST('122ed707-2bc0-42e8-b25f-6bdde7164962' AS UUID),
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
      "EntityID" = CAST('122ed707-2bc0-42e8-b25f-6bdde7164962' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Evaluation Scores for role Integration */
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
  CAST('122ed707-2bc0-42e8-b25f-6bdde7164962' AS UUID),
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
      "EntityID" = CAST('122ed707-2bc0-42e8-b25f-6bdde7164962' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: AI Agent Rubrics */
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
    '31c4e71d-0554-47bd-bcae-cd7a8199c8c3',
    'MJ: AI Agent Rubrics',
    'AI Agent Rubrics',
    'A rubric an agent publishes for how it should be judged: Evaluation (used by agent eval tests), SelfCheck (the agent checks its own output before returning), or ProductionSampling (a share of real runs is evaluated asynchronously to watch for drift).',
    NULL,
    'AIAgentRubric',
    'vwAIAgentRubrics',
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
/* SQL generated to add new entity MJ: AI Agent Rubrics to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '31c4e71d-0554-47bd-bcae-cd7a8199c8c3',
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
/* SQL generated to add new permission for entity MJ: AI Agent Rubrics for role UI */
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
  CAST('31c4e71d-0554-47bd-bcae-cd7a8199c8c3' AS UUID),
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
      "EntityID" = CAST('31c4e71d-0554-47bd-bcae-cd7a8199c8c3' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: AI Agent Rubrics for role Developer */
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
  CAST('31c4e71d-0554-47bd-bcae-cd7a8199c8c3' AS UUID),
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
      "EntityID" = CAST('31c4e71d-0554-47bd-bcae-cd7a8199c8c3' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: AI Agent Rubrics for role Integration */
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
  CAST('31c4e71d-0554-47bd-bcae-cd7a8199c8c3' AS UUID),
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
      "EntityID" = CAST('31c4e71d-0554-47bd-bcae-cd7a8199c8c3' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Rubric Categories */
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
    'c0057d48-1b9d-452f-abff-8c2774e1af9a',
    'MJ: Rubric Categories',
    'Rubric Categories',
    'Hierarchical folders for organizing rubrics.',
    NULL,
    'RubricCategory',
    'vwRubricCategories',
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
/* SQL generated to add new entity MJ: Rubric Categories to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'c0057d48-1b9d-452f-abff-8c2774e1af9a',
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
/* SQL generated to add new permission for entity MJ: Rubric Categories for role UI */
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
  CAST('c0057d48-1b9d-452f-abff-8c2774e1af9a' AS UUID),
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
      "EntityID" = CAST('c0057d48-1b9d-452f-abff-8c2774e1af9a' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Categories for role Developer */
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
  CAST('c0057d48-1b9d-452f-abff-8c2774e1af9a' AS UUID),
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
      "EntityID" = CAST('c0057d48-1b9d-452f-abff-8c2774e1af9a' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Categories for role Integration */
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
  CAST('c0057d48-1b9d-452f-abff-8c2774e1af9a' AS UUID),
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
      "EntityID" = CAST('c0057d48-1b9d-452f-abff-8c2774e1af9a' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Rubric Scales */
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
    '517dc830-dd35-4756-b1ae-eff5046b2837',
    'MJ: Rubric Scales',
    'Rubric Scales',
    'A reusable response scale that criteria are answered on: either ordered Levels (e.g. 1-5, Pass/Fail, Compliant/Partial/Non-compliant) or a Numeric range. Every answer is converted to a normalized 0..1 score. A scale used by a published rubric version is frozen in everything that affects scoring.',
    NULL,
    'RubricScale',
    'vwRubricScales',
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
/* SQL generated to add new entity MJ: Rubric Scales to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '517dc830-dd35-4756-b1ae-eff5046b2837',
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
/* SQL generated to add new permission for entity MJ: Rubric Scales for role UI */
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
  CAST('517dc830-dd35-4756-b1ae-eff5046b2837' AS UUID),
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
      "EntityID" = CAST('517dc830-dd35-4756-b1ae-eff5046b2837' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Scales for role Developer */
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
  CAST('517dc830-dd35-4756-b1ae-eff5046b2837' AS UUID),
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
      "EntityID" = CAST('517dc830-dd35-4756-b1ae-eff5046b2837' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Scales for role Integration */
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
  CAST('517dc830-dd35-4756-b1ae-eff5046b2837' AS UUID),
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
      "EntityID" = CAST('517dc830-dd35-4756-b1ae-eff5046b2837' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Rubric Scale Levels */
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
    '2e9627b0-8dc7-4cad-b5a9-a0e0180a660e',
    'MJ: Rubric Scale Levels',
    'Rubric Scale Levels',
    'One level of a Levels-type rubric scale.',
    NULL,
    'RubricScaleLevel',
    'vwRubricScaleLevels',
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
/* SQL generated to add new entity MJ: Rubric Scale Levels to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '2e9627b0-8dc7-4cad-b5a9-a0e0180a660e',
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
/* SQL generated to add new permission for entity MJ: Rubric Scale Levels for role UI */
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
  CAST('2e9627b0-8dc7-4cad-b5a9-a0e0180a660e' AS UUID),
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
      "EntityID" = CAST('2e9627b0-8dc7-4cad-b5a9-a0e0180a660e' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Scale Levels for role Developer */
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
  CAST('2e9627b0-8dc7-4cad-b5a9-a0e0180a660e' AS UUID),
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
      "EntityID" = CAST('2e9627b0-8dc7-4cad-b5a9-a0e0180a660e' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Scale Levels for role Integration */
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
  CAST('2e9627b0-8dc7-4cad-b5a9-a0e0180a660e' AS UUID),
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
      "EntityID" = CAST('2e9627b0-8dc7-4cad-b5a9-a0e0180a660e' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Rubrics */
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
    'b0dbccf6-9c62-4205-9025-f421a6cbe6e2',
    'MJ: Rubrics',
    'Rubrics',
    'The stable identity of a rubric: weighted, nested criteria that records are evaluated against. The content lives in immutable, semantically versioned RubricVersion rows.',
    NULL,
    'Rubric',
    'vwRubrics',
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
/* SQL generated to add new entity MJ: Rubrics to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'b0dbccf6-9c62-4205-9025-f421a6cbe6e2',
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
/* SQL generated to add new permission for entity MJ: Rubrics for role UI */
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
  CAST('b0dbccf6-9c62-4205-9025-f421a6cbe6e2' AS UUID),
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
      "EntityID" = CAST('b0dbccf6-9c62-4205-9025-f421a6cbe6e2' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubrics for role Developer */
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
  CAST('b0dbccf6-9c62-4205-9025-f421a6cbe6e2' AS UUID),
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
      "EntityID" = CAST('b0dbccf6-9c62-4205-9025-f421a6cbe6e2' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubrics for role Integration */
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
  CAST('b0dbccf6-9c62-4205-9025-f421a6cbe6e2' AS UUID),
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
      "EntityID" = CAST('b0dbccf6-9c62-4205-9025-f421a6cbe6e2' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Rubric Versions */
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
    'a60434b6-1893-45ed-9ecb-169ee8fe6241',
    'MJ: Rubric Versions',
    'Rubric Versions',
    'An immutable-once-published snapshot of a rubric''s content. Edits happen on the single Draft; publishing freezes it and assigns a semantic version whose bump is computed by the server from a diff against the previous published version: Major = scores are not comparable (weights, scales, gates, tree shape, N/A policy, rollup, evaluator rules), Minor = scores comparable but verdicts or interpretation may differ (threshold, bands, advisory criteria, required evidence), Patch = wording only.',
    NULL,
    'RubricVersion',
    'vwRubricVersions',
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
/* SQL generated to add new entity MJ: Rubric Versions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'a60434b6-1893-45ed-9ecb-169ee8fe6241',
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
/* SQL generated to add new permission for entity MJ: Rubric Versions for role UI */
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
  CAST('a60434b6-1893-45ed-9ecb-169ee8fe6241' AS UUID),
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
      "EntityID" = CAST('a60434b6-1893-45ed-9ecb-169ee8fe6241' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Versions for role Developer */
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
  CAST('a60434b6-1893-45ed-9ecb-169ee8fe6241' AS UUID),
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
      "EntityID" = CAST('a60434b6-1893-45ed-9ecb-169ee8fe6241' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Rubric Versions for role Integration */
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
  CAST('a60434b6-1893-45ed-9ecb-169ee8fe6241' AS UUID),
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
      "EntityID" = CAST('a60434b6-1893-45ed-9ecb-169ee8fe6241' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."RubricBand"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricBand */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricBand */
UPDATE __mj."RubricBand" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RubricBand' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricBand" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricBand" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricBand"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricBand */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricBand */
UPDATE __mj."RubricBand" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RubricBand' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricBand" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricBand" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricCriterion"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricCriterion */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricCriterion */
UPDATE __mj."RubricCriterion" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RubricCriterion' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricCriterion" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricCriterion" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricCriterion"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricCriterion */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricCriterion */
UPDATE __mj."RubricCriterion" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RubricCriterion' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricCriterion" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricCriterion" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricVersion"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricVersion */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricVersion */
UPDATE __mj."RubricVersion" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RubricVersion' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricVersion" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricVersion" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricVersion"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricVersion */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricVersion */
UPDATE __mj."RubricVersion" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RubricVersion' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricVersion" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricVersion" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricEvaluation"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricEvaluation */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricEvaluation */
UPDATE __mj."RubricEvaluation" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RubricEvaluation' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricEvaluation" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricEvaluation" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricEvaluation"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricEvaluation */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricEvaluation */
UPDATE __mj."RubricEvaluation" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RubricEvaluation' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricEvaluation" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricEvaluation" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricCriterionLevel"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricCriterionLevel */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricCriterionLevel */
UPDATE __mj."RubricCriterionLevel" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RubricCriterionLevel' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricCriterionLevel" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricCriterionLevel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricCriterionLevel"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricCriterionLevel */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricCriterionLevel */
UPDATE __mj."RubricCriterionLevel" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RubricCriterionLevel' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricCriterionLevel" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricCriterionLevel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricEvaluationScore"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricEvaluationScore */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricEvaluationScore */
UPDATE __mj."RubricEvaluationScore" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RubricEvaluationScore' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricEvaluationScore" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricEvaluationScore" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricEvaluationScore"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricEvaluationScore */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricEvaluationScore */
UPDATE __mj."RubricEvaluationScore" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RubricEvaluationScore' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricEvaluationScore" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricEvaluationScore" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricCategory"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricCategory */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricCategory */
UPDATE __mj."RubricCategory" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RubricCategory' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricCategory" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricCategory"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricCategory */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricCategory */
UPDATE __mj."RubricCategory" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RubricCategory' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricCategory" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricScaleLevel"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricScaleLevel */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricScaleLevel */
UPDATE __mj."RubricScaleLevel" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RubricScaleLevel' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricScaleLevel" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricScaleLevel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricScaleLevel"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricScaleLevel */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricScaleLevel */
UPDATE __mj."RubricScaleLevel" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RubricScaleLevel' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricScaleLevel" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricScaleLevel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentRubric"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentRubric */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentRubric */
UPDATE __mj."AIAgentRubric" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentRubric' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentRubric" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentRubric" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentRubric"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentRubric */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentRubric */
UPDATE __mj."AIAgentRubric" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentRubric' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentRubric" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentRubric" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricScale"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricScale */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RubricScale */
UPDATE __mj."RubricScale" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RubricScale' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricScale" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricScale" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RubricScale"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricScale */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RubricScale */
UPDATE __mj."RubricScale" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RubricScale' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RubricScale" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RubricScale" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."Rubric"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.Rubric */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.Rubric */
UPDATE __mj."Rubric" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'Rubric' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Rubric" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."Rubric" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."Rubric"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.Rubric */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.Rubric */
UPDATE __mj."Rubric" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'Rubric' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Rubric" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."Rubric" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c64b031-704f-4c87-aa74-74897d6d38e0' OR ("EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c64b031-704f-4c87-aa74-74897d6d38e0', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' /* Entity: MJ: Rubric Bands */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '129d94cd-3ed2-4fc8-8779-a71afe6c0a44' OR ("EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' AND "Name" = 'RubricVersionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('129d94cd-3ed2-4fc8-8779-a71afe6c0a44', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' /* Entity: MJ: Rubric Bands */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107'), 'RubricVersionID', 'Rubric Version ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'A60434B6-1893-45ED-9ECB-169EE8FE6241', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6ae81512-1741-4ad2-8228-94c346032cff' OR ("EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' AND "Name" = 'Label')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6ae81512-1741-4ad2-8228-94c346032cff', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' /* Entity: MJ: Rubric Bands */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107'), 'Label', 'Label', 'Display label of the band.', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '795c033f-7d8e-4147-96e6-74aeafd76e2d' OR ("EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('795c033f-7d8e-4147-96e6-74aeafd76e2d', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' /* Entity: MJ: Rubric Bands */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107'), 'Description', 'Description', 'What a result in this band means.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1c6af8c9-ee99-4cd6-92d3-242fcd5e8a61' OR ("EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' AND "Name" = 'MinScore')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1c6af8c9-ee99-4cd6-92d3-242fcd5e8a61', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' /* Entity: MJ: Rubric Bands */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107'), 'MinScore', 'Min Score', 'Inclusive lower bound of the band on the 0..1 normalized scale.', 'decimal', 5, 9, 6, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8e7c2833-de12-4ef4-bbca-a462d506d299' OR ("EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' AND "Name" = 'MaxScore')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8e7c2833-de12-4ef4-bbca-a462d506d299', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' /* Entity: MJ: Rubric Bands */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107'), 'MaxScore', 'Max Score', 'Exclusive upper bound of the band on the 0..1 normalized scale; the highest band also includes 1.', 'decimal', 5, 9, 6, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '63079dd1-ee78-4497-863a-0de2201d7d31' OR ("EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' AND "Name" = 'DisplayTone')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('63079dd1-ee78-4497-863a-0de2201d7d31', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' /* Entity: MJ: Rubric Bands */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107'), 'DisplayTone', 'Display Tone', 'Semantic tone the UI maps to design tokens (never a raw color).', 'nvarchar', 40, 0, 0, FALSE, 'Neutral', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b29034d2-4493-42b3-aaad-43eb9ca5aa41' OR ("EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b29034d2-4493-42b3-aaad-43eb9ca5aa41', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' /* Entity: MJ: Rubric Bands */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107'), 'Sequence', 'Sequence', 'Display order of the band.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e75b316a-bf48-4584-812b-c97c697a7e54' OR ("EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e75b316a-bf48-4584-812b-c97c697a7e54', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' /* Entity: MJ: Rubric Bands */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '343cb080-7cd9-4319-b442-b13d73d802ac' OR ("EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('343cb080-7cd9-4319-b442-b13d73d802ac', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107' /* Entity: MJ: Rubric Bands */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a7c67fdf-1592-44fe-8d02-5a672666b826' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a7c67fdf-1592-44fe-8d02-5a672666b826', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '86d5e388-2ebf-4451-a197-b5ad57b38dbe' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'RubricVersionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86d5e388-2ebf-4451-a197-b5ad57b38dbe', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'RubricVersionID', 'Rubric Version ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'A60434B6-1893-45ED-9ECB-169EE8FE6241', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6bec48d3-bfa6-4c7c-8a68-fe9c8c27b49a' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'ParentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6bec48d3-bfa6-4c7c-8a68-fe9c8c27b49a', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'ParentID', 'Parent ID', 'Parent group node. NULL = a top-level node of the rubric.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a2dd9709-e899-4c26-93a6-8c3d03791bfc' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'Key')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a2dd9709-e899-4c26-93a6-8c3d03791bfc', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'Key', 'Key', 'Stable machine key, unique within the version and carried unchanged across versions. It is the criterion''s identity for comparing and aggregating results over time; renaming it is a removal plus an addition (a major bump).', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b1cf06bc-3115-4e78-bc79-3b23bcd3443b' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b1cf06bc-3115-4e78-bc79-3b23bcd3443b', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'Name', 'Name', 'Display name of the group or criterion.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '67aa912d-11c5-4aa2-a609-94d5e208498c' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('67aa912d-11c5-4aa2-a609-94d5e208498c', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'Description', 'Description', 'What the node covers.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd6eb95c7-07f1-43f2-ac62-26771b91fa20' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'Guidance')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d6eb95c7-07f1-43f2-ac62-26771b91fa20', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'Guidance', 'Guidance', 'Instructions to evaluators (human and AI) on how to judge this criterion and what evidence counts.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '24bbbbb9-2bbd-40aa-9239-a4182a4b7d73' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'NodeType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('24bbbbb9-2bbd-40aa-9239-a4182a4b7d73', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'NodeType', 'Node Type', 'Group: has children, no scale, and a computed score. Criterion: a leaf answered on ScaleID.', 'nvarchar', 40, 0, 0, FALSE, 'Criterion', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '30dfefd4-d529-48f8-8d41-15d2879416dd' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'ScaleID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('30dfefd4-d529-48f8-8d41-15d2879416dd', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'ScaleID', 'Scale ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '517DC830-DD35-4756-B1AE-EFF5046B2837', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ab71f12d-2b15-4a66-b12a-c75f791ccc5a' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'Weight')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ab71f12d-2b15-4a66-b12a-c75f791ccc5a', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'Weight', 'Weight', 'Relative weight among siblings (normalized within the parent at scoring time). Must be >= 0.', 'decimal', 9, 18, 6, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c540ef79-dcf4-4bef-af86-d69aeb0f4385' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'IsAdvisory')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c540ef79-dcf4-4bef-af86-d69aeb0f4385', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'IsAdvisory', 'Is Advisory', '1 = recorded and displayed but excluded from every score, gate and pass decision.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '87ce0767-8b8c-448f-b7b4-20a676047987' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'IsGate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('87ce0767-8b8c-448f-b7b4-20a676047987', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'IsGate', 'Is Gate', '1 = knockout: if this node''s normalized score is below GateMinimumScore the whole evaluation fails, whatever its overall score. Also applies to groups.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b4ca6ed8-dfdc-4c24-9b81-d88db02b3782' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'GateMinimumScore')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b4ca6ed8-dfdc-4c24-9b81-d88db02b3782', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'GateMinimumScore', 'Gate Minimum Score', 'Normalized score (0..1) a gate node must reach. Required when IsGate = 1.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '14521f7b-19e9-425a-bd56-961fb64bd2fb' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'NotApplicablePolicy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('14521f7b-19e9-425a-bd56-961fb64bd2fb', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'NotApplicablePolicy', 'Not Applicable Policy', 'Overrides the version''s NotApplicablePolicy for this node. NULL = inherit.', 'nvarchar', 60, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e03cf48c-ccf7-4b65-a47d-bcbf5342d59e' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'RollupMethod')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e03cf48c-ccf7-4b65-a47d-bcbf5342d59e', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'RollupMethod', 'Rollup Method', 'How a group combines its children''s scores: WeightedMean (default when NULL), Minimum (weakest child), or Maximum (strongest child). Groups only.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b92679fa-e7b4-401a-8390-361832b454a3' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'EvidenceRequired')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b92679fa-e7b4-401a-8390-361832b454a3', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'EvidenceRequired', 'Evidence Required', '1 = an evaluation cannot be submitted without evidence for this criterion.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c460160-e2a0-443e-94bf-e7108952ab3e' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'RationaleRequired')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c460160-e2a0-443e-94bf-e7108952ab3e', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'RationaleRequired', 'Rationale Required', '1 = an evaluation cannot be submitted without a written rationale for this criterion.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '29259585-d4f7-482b-8a7e-72974a771c18' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('29259585-d4f7-482b-8a7e-72974a771c18', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'Sequence', 'Sequence', 'Display order among siblings.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a2b940c1-3fc0-4577-aaad-3eef65abf039' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'EvaluatorConfig')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a2b940c1-3fc0-4577-aaad-3eef65abf039', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'EvaluatorConfig', 'Evaluator Config', 'JSON (IRubricCriterionEvaluatorConfig) of evaluator-specific settings, keyed by evaluator: e.g. a deterministic rule, or hints for AI judges. Changes are treated as scoring changes (major bump) because a deterministic rule decides the score.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6af4125e-0d5c-4b16-9219-e9bd36513e1a' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6af4125e-0d5c-4b16-9219-e9bd36513e1a', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a4a993b1-66c7-4e7e-8c25-d059fa135222' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a4a993b1-66c7-4e7e-8c25-d059fa135222', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1211a184-bb24-488e-b9a8-1ac403463540' OR ("EntityID" = '1F949AD0-8C72-4846-8A0B-0B3D9F644231' AND "Name" = 'RubricID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1211a184-bb24-488e-b9a8-1ac403463540', '1F949AD0-8C72-4846-8A0B-0B3D9F644231' /* Entity: MJ: Tests */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1F949AD0-8C72-4846-8A0B-0B3D9F644231'), 'RubricID', 'Rubric ID', 'The rubric this test''s output is judged by. NULL = inherit from the suite (walking up ParentID). The latest published version is pinned when each run starts.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a3ada022-fa46-4973-92a9-bd87c36bd384' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a3ada022-fa46-4973-92a9-bd87c36bd384', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '72db33e1-26a4-4a67-bf60-036f309e223a' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'RubricID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('72db33e1-26a4-4a67-bf60-036f309e223a', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'RubricID', 'Rubric ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '41258ffd-49e9-4914-b5f6-1c7f84642691' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'MajorVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('41258ffd-49e9-4914-b5f6-1c7f84642691', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'MajorVersion', 'Major Version', 'Semantic major version, assigned at publish. Evaluations sharing a rubric and major version are directly comparable. NULL while Draft.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8e4f9e21-9bd9-41c6-9f65-d16439831ade' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'MinorVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8e4f9e21-9bd9-41c6-9f65-d16439831ade', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'MinorVersion', 'Minor Version', 'Semantic minor version, assigned at publish. NULL while Draft.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '86fa8855-1231-4ad1-aae0-9f3e3f4a9884' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'PatchVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86fa8855-1231-4ad1-aae0-9f3e3f4a9884', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'PatchVersion', 'Patch Version', 'Semantic patch version, assigned at publish. NULL while Draft.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '710875cf-a1ac-4264-a9ce-bfa78f90f004' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('710875cf-a1ac-4264-a9ce-bfa78f90f004', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'Status', 'Status', 'Draft (editable, at most one per rubric), Published (frozen, available for new evaluations), or Retired (frozen, kept for history and for evaluations already pinned to it).', 'nvarchar', 40, 0, 0, FALSE, 'Draft', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '805dbb48-0c2a-4d0d-aed0-d51aa8eab8d4' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'BasedOnVersionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('805dbb48-0c2a-4d0d-aed0-d51aa8eab8d4', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'BasedOnVersionID', 'Based On Version ID', 'The version this draft was cloned from; the publish-time diff and bump are computed against it.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'A60434B6-1893-45ED-9ECB-169EE8FE6241', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9df717a2-9669-4b31-9cdd-25e59fd05f68' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'Instructions')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9df717a2-9669-4b31-9cdd-25e59fd05f68', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'Instructions', 'Instructions', 'Overall guidance for evaluators (human and AI) applying this version. Wording only: changing it is a patch.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0de57de0-08ea-477a-a6ff-a6b5d59e69d9' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'PassThreshold')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0de57de0-08ea-477a-a6ff-a6b5d59e69d9', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'PassThreshold', 'Pass Threshold', 'Default minimum normalized score (0..1) for an evaluation to pass. Consumers (a test, a review round) may override it; the threshold actually used is stored on each evaluation. NULL = no threshold (evaluations report a score and gate results only).', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd7a4d0de-d847-4b53-b3a7-340911287d77' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'MinimumCompleteness')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d7a4d0de-d847-4b53-b3a7-340911287d77', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'MinimumCompleteness', 'Minimum Completeness', 'Minimum share (0..1) of applicable scored criteria required for a valid result. Below it the evaluation''s Outcome is Incomplete and it does not pass. NULL = no minimum.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8846fcc7-4ab9-4c98-805a-d3a0d4b49a63' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'NotApplicablePolicy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8846fcc7-4ab9-4c98-805a-d3a0d4b49a63', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'NotApplicablePolicy', 'Not Applicable Policy', 'Default handling of a criterion answered Not Applicable (criteria may override): ExcludeAndRedistribute (drop it and share its weight among its siblings), CountAsZero (score it 0), FailEvaluation (allowed, but the evaluation fails), NotAllowed (the evaluation cannot be submitted).', 'nvarchar', 60, 0, 0, FALSE, 'ExcludeAndRedistribute', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '935b0d20-c725-4ac1-a3f0-18fff53d939e' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'ScoreDisplayMin')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('935b0d20-c725-4ac1-a3f0-18fff53d939e', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'ScoreDisplayMin', 'Score Display Min', 'Display-only lower bound: the value a normalized score of 0 is shown as (e.g. 0 or 1). Never used in scoring.', 'decimal', 9, 18, 6, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2135fdc5-d063-47c2-a1aa-1ddc0adb3827' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'ScoreDisplayMax')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2135fdc5-d063-47c2-a1aa-1ddc0adb3827', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'ScoreDisplayMax', 'Score Display Max', 'Display-only upper bound: the value a normalized score of 1 is shown as (e.g. 100 or 5). Never used in scoring.', 'decimal', 9, 18, 6, FALSE, '(100)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd5b32ea-f814-4626-9d8c-ed1ef5d73709' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'RequestedBump')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cd5b32ea-f814-4626-9d8c-ed1ef5d73709', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'RequestedBump', 'Requested Bump', 'Optional bump the author asks for on publish. The server applies the larger of this and the bump it computes; an author can never publish a smaller bump than the change requires.', 'nvarchar', 20, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7b3ee0a3-0e05-4b27-b769-d7688da3589b' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'ComputedBump')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7b3ee0a3-0e05-4b27-b769-d7688da3589b', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'ComputedBump', 'Computed Bump', 'The bump the server computed from the diff at publish (Initial for a rubric''s first version).', 'nvarchar', 20, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aae30202-71bc-4f2e-bafb-42fa651ba334' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'AppliedBump')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aae30202-71bc-4f2e-bafb-42fa651ba334', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'AppliedBump', 'Applied Bump', 'The bump actually applied at publish: the larger of ComputedBump and RequestedBump.', 'nvarchar', 20, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '460a02fb-52da-4356-a032-0cd53e26c03f' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'ChangeSummary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('460a02fb-52da-4356-a032-0cd53e26c03f', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'ChangeSummary', 'Change Summary', 'Author''s human-readable summary of what changed in this version.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ca346c24-681d-4777-ae8f-369d45dafee5' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'ChangeDetails')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ca346c24-681d-4777-ae8f-369d45dafee5', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'ChangeDetails', 'Change Details', 'JSON diff produced at publish: every added, removed and changed node and property, each with the bump it required. Explains ComputedBump.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '10f7bf34-e741-4957-bf68-3edbd1e06085' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'ContentHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('10f7bf34-e741-4957-bf68-3edbd1e06085', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'ContentHash', 'Content Hash', 'SHA-256 of the version''s full canonical content (scoring math plus all wording), computed at publish.', 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ee76f469-1d6d-4210-a45c-53ec16d8b6b5' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'ScoringHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ee76f469-1d6d-4210-a45c-53ec16d8b6b5', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'ScoringHash', 'Scoring Hash', 'SHA-256 of only the scoring-relevant content (tree shape, keys, weights, scales, gates, policies, rollups, evaluator rules). Two versions with equal ScoringHash compute identical scores from identical answers.', 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0a66ba78-a531-46b0-af60-bc5cae725bef' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'PublishedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0a66ba78-a531-46b0-af60-bc5cae725bef', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'PublishedAt', 'Published At', 'When the version was published.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4aaa86aa-8db7-40f1-944c-0bd79548cbdd' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'PublishedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4aaa86aa-8db7-40f1-944c-0bd79548cbdd', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'PublishedByUserID', 'Published By User ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad63ad16-f966-49e2-9566-52e04aa105e5' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'RetiredAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad63ad16-f966-49e2-9566-52e04aa105e5', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'RetiredAt', 'Retired At', 'When the version was retired. NULL while Draft or Published.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e4fc5173-e612-46fd-aa2e-6a10469fa4df' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e4fc5173-e612-46fd-aa2e-6a10469fa4df', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '60b4059a-5246-4a1e-a12b-ab441e5b6503' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('60b4059a-5246-4a1e-a12b-ab441e5b6503', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '87fefcdc-323b-40a3-bad9-1d7dd3b05f9c' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('87fefcdc-323b-40a3-bad9-1d7dd3b05f9c', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2e13a17a-f402-4cb6-9cea-7d6d49500dc0' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'RubricVersionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2e13a17a-f402-4cb6-9cea-7d6d49500dc0', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'RubricVersionID', 'Rubric Version ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'A60434B6-1893-45ED-9ECB-169EE8FE6241', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3d93fa95-a9f2-4f32-9ea7-01606fcae64b' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'SubjectEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3d93fa95-a9f2-4f32-9ea7-01606fcae64b', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'SubjectEntityID', 'Subject Entity ID', 'The entity of the record being evaluated (a test run, an agent run, a submission, a vendor response, ...).', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '85a5c500-266b-4fce-977a-a2656eeb6366' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'SubjectRecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('85a5c500-266b-4fce-977a-a2656eeb6366', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'SubjectRecordID', 'Subject Record ID', 'Primary key of the record being evaluated, in MemberJunction''s composite-key string form.', 'nvarchar', 900, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd31d42f8-8baa-48a3-9d5f-e2b664d2da9c' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'ContextEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d31d42f8-8baa-48a3-9d5f-e2b664d2da9c', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'ContextEntityID', 'Context Entity ID', 'Optional entity of the record that asked for this evaluation (a test, a review round, a workflow step). Evaluations share a consensus cohort only when their context matches.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '11c5a2b8-a5a9-4a2b-a709-c4770b297321' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'ContextRecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('11c5a2b8-a5a9-4a2b-a709-c4770b297321', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'ContextRecordID', 'Context Record ID', 'Primary key of the context record. Set together with ContextEntityID or not at all.', 'nvarchar', 900, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2d48f9b7-df97-44d3-a0ad-554c129e3c0d' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'EvaluatorType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2d48f9b7-df97-44d3-a0ad-554c129e3c0d', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'EvaluatorType', 'Evaluator Type', 'Who judged: Human (a user), AIPrompt (an LLM judge), Agent (an agent that may use tools), Deterministic (rules), Self (the subject''s own party, e.g. a vendor asserting compliance; excluded from reviewer consensus), External (imported from another system).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '035b80a3-2e52-4d77-829d-c9e3ceebde04' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'EvaluatorUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('035b80a3-2e52-4d77-829d-c9e3ceebde04', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'EvaluatorUserID', 'Evaluator User ID', 'The user who evaluated. Required for Human; the responding user for Self.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b66cc5d6-200f-48da-8208-9f6a5127c890' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'AIPromptRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b66cc5d6-200f-48da-8208-9f6a5127c890', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'AIPromptRunID', 'AI Prompt Run ID', 'The prompt run that produced an AIPrompt evaluation (model, cost, raw output).', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '03428139-4536-4a06-8fd1-5c910fc8e5b2' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'AIAgentRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('03428139-4536-4a06-8fd1-5c910fc8e5b2', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'AIAgentRunID', 'AI Agent Run ID', 'The agent run that produced an Agent evaluation.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a666f0c5-07a7-4286-80a0-097a2e64dc41' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'EvaluatorName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a666f0c5-07a7-4286-80a0-097a2e64dc41', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'EvaluatorName', 'Evaluator Name', 'Name of the evaluator implementation or external source (e.g. the evaluator driver class) for provenance.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9fddd026-6dbe-41d6-891e-6121d865f250' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9fddd026-6dbe-41d6-891e-6121d865f250', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'Status', 'Status', 'Draft (being filled in), Submitted (final, counted in consensus), Superseded (replaced by a newer evaluation), Withdrawn (retracted, e.g. a conflict of interest), Failed (the evaluator errored; see ErrorMessage).', 'nvarchar', 40, 0, 0, FALSE, 'Draft', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32af95b5-c8af-4c4c-ad93-b8a8848d8045' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'SupersedesEvaluationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('32af95b5-c8af-4c4c-ad93-b8a8848d8045', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'SupersedesEvaluationID', 'Supersedes Evaluation ID', 'The earlier evaluation this one corrects. Submitting this one moves that one to Superseded.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7FAA091D-C1A3-48A7-82D2-3D17729470F9', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '36ea39ef-fd7e-4ee3-be7e-d34f331a8f92' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'SubmittedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('36ea39ef-fd7e-4ee3-be7e-d34f331a8f92', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'SubmittedAt', 'Submitted At', 'When the evaluation was submitted and its result computed.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '72584d29-bafd-43c7-b7ea-b676057ec1c6' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'PassThresholdApplied')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('72584d29-bafd-43c7-b7ea-b676057ec1c6', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'PassThresholdApplied', 'Pass Threshold Applied', 'The pass threshold used to compute Passed (the version default or a consumer override). Stored so a later change to either never rewrites history.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ccda50b8-2550-4ba6-acee-503fc4e27b89' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'NormalizedScore')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ccda50b8-2550-4ba6-acee-503fc4e27b89', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'NormalizedScore', 'Normalized Score', 'Overall score, 0..1, computed once at submit from the score rows. NULL if nothing applicable was scored.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e9f67d79-0099-4809-af2a-a45dd4be49f7' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'Passed')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e9f67d79-0099-4809-af2a-a45dd4be49f7', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'Passed', 'Passed', 'Computed verdict: 1 = passed, 0 = failed, NULL = no threshold applied and no gate or N/A failure (Outcome = Scored).', 'bit', 1, 1, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e88e0661-2d97-4a97-a6fe-512ce09b0da1' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'Outcome')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e88e0661-2d97-4a97-a6fe-512ce09b0da1', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'Outcome', 'Outcome', 'Why the evaluation ended as it did: Passed, BelowThreshold, GateFailed, NotApplicableFailure, Incomplete (below MinimumCompleteness or nothing scored), or Scored (no threshold to judge against).', 'nvarchar', 60, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1f9baac-97e5-48ca-96e3-0af0b5ff0e80' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'BandID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f1f9baac-97e5-48ca-96e3-0af0b5ff0e80', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'BandID', 'Band ID', 'The band NormalizedScore falls in, for display. Interpretation only.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4f0f9a9b-b813-4980-ac3e-000a41b712b6' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'GateFailed')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4f0f9a9b-b813-4980-ac3e-000a41b712b6', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'GateFailed', 'Gate Failed', '1 = at least one gate node scored below its GateMinimumScore.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '78230e8d-7626-44df-b2f2-9bd80fbd671d' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'Completeness')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('78230e8d-7626-44df-b2f2-9bd80fbd671d', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'Completeness', 'Completeness', 'Share (0..1) of applicable, non-advisory criteria that were scored.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4bd4c435-9b30-4fe2-a8a8-600b1b8cc3de' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'ScoredCriteriaCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4bd4c435-9b30-4fe2-a8a8-600b1b8cc3de', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'ScoredCriteriaCount', 'Scored Criteria Count', 'Number of non-advisory criteria that received a score.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'df558657-c467-4a98-98e9-ffd87d907a6a' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'ApplicableCriteriaCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('df558657-c467-4a98-98e9-ffd87d907a6a', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'ApplicableCriteriaCount', 'Applicable Criteria Count', 'Number of non-advisory criteria not answered Not Applicable.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '40139bed-15fd-41ce-b413-55dbd6fd40d8' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'TotalCriteriaCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('40139bed-15fd-41ce-b413-55dbd6fd40d8', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'TotalCriteriaCount', 'Total Criteria Count', 'Number of non-advisory criteria (leaves) in the version.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '316c624e-a1bd-4fc6-800f-fbc99e879fb2' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'Confidence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('316c624e-a1bd-4fc6-800f-fbc99e879fb2', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'Confidence', 'Confidence', 'Evaluator''s overall confidence (0..1), typically the weighted mean of per-criterion confidences from an AI judge. NULL for evaluators that do not report one.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '595e3465-fec5-47ba-aa2a-ee9925977ea8' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'Narrative')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('595e3465-fec5-47ba-aa2a-ee9925977ea8', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'Narrative', 'Narrative', 'The evaluator''s overall written assessment.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5e859719-e584-4fee-bd53-5a849c9549ba' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'ErrorMessage')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5e859719-e584-4fee-bd53-5a849c9549ba', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'ErrorMessage', 'Error Message', 'Why the evaluator failed, when Status = Failed.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ec95865f-9654-4940-9f6f-2048210858d2' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'ScoringEngineVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ec95865f-9654-4940-9f6f-2048210858d2', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'ScoringEngineVersion', 'Scoring Engine Version', 'Version of the scoring algorithm that computed the stored result, so a future algorithm change is visible rather than silent.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9c02a253-fec6-4345-bb2a-0b9bfc808bd5' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'Metadata')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9c02a253-fec6-4345-bb2a-0b9bfc808bd5', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'Metadata', 'Metadata', 'JSON (IRubricEvaluationMetadata) of evaluator provenance not covered by columns: model settings, timings, the consumer that requested it.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2895fbb8-ddb1-476e-aa74-9eccebae66cb' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2895fbb8-ddb1-476e-aa74-9eccebae66cb', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e01f635d-9af8-49bf-a569-2b3a1d56a7a9' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e01f635d-9af8-49bf-a569-2b3a1d56a7a9', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a4f12d12-16b0-498a-8932-2bef956bf57a' OR ("EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a4f12d12-16b0-498a-8932-2bef956bf57a', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' /* Entity: MJ: Rubric Criterion Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '368a703c-cb22-45d5-9c20-b9e485f384a8' OR ("EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' AND "Name" = 'CriterionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('368a703c-cb22-45d5-9c20-b9e485f384a8', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' /* Entity: MJ: Rubric Criterion Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7'), 'CriterionID', 'Criterion ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '82d17768-35bc-4cf5-bb58-09f42efc2a50' OR ("EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' AND "Name" = 'ScaleLevelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('82d17768-35bc-4cf5-bb58-09f42efc2a50', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' /* Entity: MJ: Rubric Criterion Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7'), 'ScaleLevelID', 'Scale Level ID', 'The Levels-scale level this anchor describes. Exactly one of ScaleLevelID and AnchorValue is set.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '12df9636-26bd-4f17-8c13-98eab573c87a' OR ("EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' AND "Name" = 'AnchorValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('12df9636-26bd-4f17-8c13-98eab573c87a', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' /* Entity: MJ: Rubric Criterion Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7'), 'AnchorValue', 'Anchor Value', 'For a Numeric scale: the value this anchor describes (e.g. 0, 50, 100).', 'decimal', 9, 18, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b6455b68-2985-4083-a013-2c427956aef5' OR ("EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' AND "Name" = 'Descriptor')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b6455b68-2985-4083-a013-2c427956aef5', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' /* Entity: MJ: Rubric Criterion Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7'), 'Descriptor', 'Descriptor', 'The anchor text shown to evaluators and given to AI judges.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c112929-50ef-4c14-9f3c-07748324a597' OR ("EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c112929-50ef-4c14-9f3c-07748324a597', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' /* Entity: MJ: Rubric Criterion Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7be0894b-4ee5-4613-8965-594239935e9f' OR ("EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7be0894b-4ee5-4613-8965-594239935e9f', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' /* Entity: MJ: Rubric Criterion Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '15abff6f-df7c-4c62-a2ca-1b57822e0671' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('15abff6f-df7c-4c62-a2ca-1b57822e0671', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bbdea7f4-4277-4f64-91a4-7fea365ae0ae' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'EvaluationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bbdea7f4-4277-4f64-91a4-7fea365ae0ae', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'EvaluationID', 'Evaluation ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '7FAA091D-C1A3-48A7-82D2-3D17729470F9', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fb1c7408-28a7-4d8a-adad-a70a1730ed64' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'CriterionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fb1c7408-28a7-4d8a-adad-a70a1730ed64', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'CriterionID', 'Criterion ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2dcdd8ba-931b-4118-8867-22c58a31d2f4' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'ScaleLevelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2dcdd8ba-931b-4118-8867-22c58a31d2f4', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'ScaleLevelID', 'Scale Level ID', 'The level chosen, for a criterion on a Levels scale.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2d1ebf74-8d6e-4823-b312-fca8b179ec14' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'RawValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2d1ebf74-8d6e-4823-b312-fca8b179ec14', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'RawValue', 'Raw Value', 'The number entered, for a criterion on a Numeric scale.', 'decimal', 9, 18, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '29c958de-39c3-4801-868a-77436d646776' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'IsNotApplicable')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('29c958de-39c3-4801-868a-77436d646776', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'IsNotApplicable', 'Is Not Applicable', '1 = the evaluator judged this criterion not applicable to the subject; handled per the effective NotApplicablePolicy.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2d749924-2648-4881-a48a-6a0559743837' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'IsComputed')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2d749924-2648-4881-a48a-6a0559743837', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'IsComputed', 'Is Computed', '1 = a group rollup written by the server at submit, not an evaluator''s answer.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb4dfeb8-48db-4bf9-91a4-d97b9a12d9a6' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'NormalizedScore')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eb4dfeb8-48db-4bf9-91a4-d97b9a12d9a6', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'NormalizedScore', 'Normalized Score', 'The node''s score on the 0..1 scale: the answer normalized through its scale, or the group rollup.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aa3dd88e-c7ad-4e59-a1a0-c0a0ec533f86' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'EffectiveWeight')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aa3dd88e-c7ad-4e59-a1a0-c0a0ec533f86', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'EffectiveWeight', 'Effective Weight', 'The node''s share of its parent (0..1) after Not Applicable redistribution.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4426306e-ca25-4fc0-adc8-8e08948c95ea' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'OverallContribution')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4426306e-ca25-4fc0-adc8-8e08948c95ea', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'OverallContribution', 'Overall Contribution', 'Points this node contributed to the evaluation''s overall NormalizedScore (its score times the product of effective weights to the root). Leaves'' contributions sum to the overall score under weighted-mean rollups.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f6335b5d-b1ce-4e23-a343-1d86559b252a' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'GateFailed')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f6335b5d-b1ce-4e23-a343-1d86559b252a', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'GateFailed', 'Gate Failed', '1 = this node is a gate and scored below its GateMinimumScore.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '843ba5b1-1922-460c-a1d5-2937cb7b05b2' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'Completeness')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('843ba5b1-1922-460c-a1d5-2937cb7b05b2', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'Completeness', 'Completeness', 'For group rows: share (0..1) of applicable descendant criteria that were scored.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e3e71ea3-8a38-4c18-b943-6a415b878030' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'Confidence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e3e71ea3-8a38-4c18-b943-6a415b878030', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'Confidence', 'Confidence', 'Evaluator''s confidence in this answer (0..1), e.g. from an AI judge''s level probabilities. Low confidence can route the criterion to a human.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0a7e1f12-5e1d-4e13-816a-57f88c84ea61' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'Rationale')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0a7e1f12-5e1d-4e13-816a-57f88c84ea61', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'Rationale', 'Rationale', 'The evaluator''s reasoning for this answer.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7399e602-4a32-4944-a481-40b246508779' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'Evidence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7399e602-4a32-4944-a481-40b246508779', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'Evidence', 'Evidence', 'JSON array (IRubricEvidence[]) of evidence items: quotes with spans, conversation turns, file references, URLs, record references.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fa26de64-1f56-41ad-af63-984541b9c1a7' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fa26de64-1f56-41ad-af63-984541b9c1a7', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1e203853-417a-48f9-b125-1cfe5f7d477c' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1e203853-417a-48f9-b125-1cfe5f7d477c', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0c1760d3-ef7f-422b-8c98-d795795edb30' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0c1760d3-ef7f-422b-8c98-d795795edb30', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c6947b34-5ae9-4d6a-83a8-9eda47344329' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c6947b34-5ae9-4d6a-83a8-9eda47344329', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), 'Name', 'Name', 'Display name of the category.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd72cb8cb-1b57-4309-8fc6-b566d3d9354f' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d72cb8cb-1b57-4309-8fc6-b566d3d9354f', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), 'Description', 'Description', 'What rubrics in this category are for.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ab6a53f9-08f6-4ee9-aba2-fed38447a994' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = 'ParentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ab6a53f9-08f6-4ee9-aba2-fed38447a994', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), 'ParentID', 'Parent ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b7330159-7be6-42fc-9602-75b6d212edda' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b7330159-7be6-42fc-9602-75b6d212edda', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '26116c4c-ea51-4532-9c5a-628583350917' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('26116c4c-ea51-4532-9c5a-628583350917', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5962803f-3581-40b3-9664-6d48dcbab015' OR ("EntityID" = '8FC868B5-778D-4282-BBAB-91C01F863C83' AND "Name" = 'RubricID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5962803f-3581-40b3-9664-6d48dcbab015', '8FC868B5-778D-4282-BBAB-91C01F863C83' /* Entity: MJ: Test Suites */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8FC868B5-778D-4282-BBAB-91C01F863C83'), 'RubricID', 'Rubric ID', 'Default rubric for tests in this suite and its child suites that do not name their own.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4c372250-4b93-4bd4-b5ec-c5ca4d365609' OR ("EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4c372250-4b93-4bd4-b5ec-c5ca4d365609', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' /* Entity: MJ: Rubric Scale Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7048894c-7e69-4e62-8f1b-9bd167bd1254' OR ("EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' AND "Name" = 'ScaleID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7048894c-7e69-4e62-8f1b-9bd167bd1254', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' /* Entity: MJ: Rubric Scale Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E'), 'ScaleID', 'Scale ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '517DC830-DD35-4756-B1AE-EFF5046B2837', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fb542f8c-ce8e-4b67-b9d0-a439a21e3ad1' OR ("EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' AND "Name" = 'Label')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fb542f8c-ce8e-4b67-b9d0-a439a21e3ad1', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' /* Entity: MJ: Rubric Scale Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E'), 'Label', 'Label', 'What evaluators see and pick, e.g. "Exceeds", "Partially compliant", "4".', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fec41045-6bb9-43c3-93c1-61009e08e8bb' OR ("EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' AND "Name" = 'Value')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fec41045-6bb9-43c3-93c1-61009e08e8bb', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' /* Entity: MJ: Rubric Scale Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E'), 'Value', 'Value', 'The level''s raw value in the scale''s own units, e.g. 4 on a 1-5 scale. Display and export only; scoring uses NormalizedValue.', 'decimal', 9, 18, 6, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c66e3ffa-8645-4e74-9ea1-e2664b6b393c' OR ("EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' AND "Name" = 'NormalizedValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c66e3ffa-8645-4e74-9ea1-e2664b6b393c', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' /* Entity: MJ: Rubric Scale Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E'), 'NormalizedValue', 'Normalized Value', 'The score this level contributes, from 0 (worst) to 1 (best). Explicit rather than derived so non-linear scales (e.g. Partial = 0.4) are expressible.', 'decimal', 5, 9, 6, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '157db023-926c-4532-9076-7bad971ebd31' OR ("EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('157db023-926c-4532-9076-7bad971ebd31', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' /* Entity: MJ: Rubric Scale Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E'), 'Description', 'Description', 'Generic meaning of the level. Criteria can override it with their own anchor text (RubricCriterionLevel).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b803f1b5-1c62-4d60-9bb9-4503a05d0757' OR ("EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b803f1b5-1c62-4d60-9bb9-4503a05d0757', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' /* Entity: MJ: Rubric Scale Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E'), 'Sequence', 'Sequence', 'Display order of the level within its scale, worst to best by convention.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aa11aaa0-996d-44f4-90e8-ae9f1f27ebbe' OR ("EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aa11aaa0-996d-44f4-90e8-ae9f1f27ebbe', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' /* Entity: MJ: Rubric Scale Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5915fc3a-cc63-46b2-bb43-78a7cdbf8486' OR ("EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5915fc3a-cc63-46b2-bb43-78a7cdbf8486', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' /* Entity: MJ: Rubric Scale Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c6a5521-ba6e-4f79-946e-5a4753e4ca38' OR ("EntityID" = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' AND "Name" = 'Score')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c6a5521-ba6e-4f79-946e-5a4753e4ca38', '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' /* Entity: MJ: Test Suite Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7'), 'Score', 'Score', 'Suite-level score (0..1): the mean score of the suite''s executed (non-skipped) test runs.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9aafd179-300b-41d2-a29f-6eb07e15aef1' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9aafd179-300b-41d2-a29f-6eb07e15aef1', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '81e9225b-3e70-4bb0-9161-d99b97bac6d9' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'AgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('81e9225b-3e70-4bb0-9161-d99b97bac6d9', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'AgentID', 'Agent ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '430acaae-d57e-4b8d-b481-8821088bd468' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'RubricID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('430acaae-d57e-4b8d-b481-8821088bd468', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'RubricID', 'Rubric ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f84fa88e-34a6-42aa-8600-1620a42af584' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'Purpose')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f84fa88e-34a6-42aa-8600-1620a42af584', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'Purpose', 'Purpose', 'How the agent uses the rubric: Evaluation, SelfCheck or ProductionSampling.', 'nvarchar', 60, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '28b57009-cc4c-470e-a486-7f40c3fabccb' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'IsDefault')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('28b57009-cc4c-470e-a486-7f40c3fabccb', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'IsDefault', 'Is Default', '1 = the rubric used for this purpose when a caller does not name one.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8f9f292-a7f5-49a1-8047-1df529856653' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d8f9f292-a7f5-49a1-8047-1df529856653', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'Status', 'Status', 'Active links are used; Disabled links are kept but ignored.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8d83ed51-2476-411d-b85e-e8425f6207b6' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'PassThreshold')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8d83ed51-2476-411d-b85e-e8425f6207b6', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'PassThreshold', 'Pass Threshold', 'Overrides the rubric version''s PassThreshold (0..1) for this agent and purpose. NULL = use the version default.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '97b69645-a312-4a24-8752-429b3598687f' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'SampleRate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('97b69645-a312-4a24-8752-429b3598687f', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'SampleRate', 'Sample Rate', 'Share (0..1) of completed production runs to evaluate. Required for ProductionSampling. Sampling is deterministic on the run ID so it is reproducible.', 'decimal', 5, 9, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6fc08957-1e48-4764-8c66-19a01b844e5c' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'MaxSelfCheckAttempts')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6fc08957-1e48-4764-8c66-19a01b844e5c', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'MaxSelfCheckAttempts', 'Max Self Check Attempts', 'For SelfCheck: how many times the agent may revise its output after a failed self-check before returning anyway (with the failure recorded). NULL = 1.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b5ae28a0-1728-49e1-a29a-8114543ab4b7' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'EvaluatorConfig')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b5ae28a0-1728-49e1-a29a-8114543ab4b7', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'EvaluatorConfig', 'Evaluator Config', 'JSON (IRubricEvaluatorSelection) naming which evaluator to use and its settings (e.g. judge prompt, model), overriding the defaults.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e3d5d89a-0701-46c4-8c8c-896402ac411e' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e3d5d89a-0701-46c4-8c8c-896402ac411e', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'Sequence', 'Sequence', 'Display and evaluation order when an agent has several rubrics for one purpose.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ea9b8fe3-e6b6-44e9-b18f-dddc68ed0343' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ea9b8fe3-e6b6-44e9-b18f-dddc68ed0343', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4b7bbfd6-a385-4492-a6ef-7237b1baa8e9' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4b7bbfd6-a385-4492-a6ef-7237b1baa8e9', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '75f6a4e0-ec35-4686-b7fd-9e2f20eaae0f' OR ("EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('75f6a4e0-ec35-4686-b7fd-9e2f20eaae0f', '517DC830-DD35-4756-B1AE-EFF5046B2837' /* Entity: MJ: Rubric Scales */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ca68949f-32c6-4dfa-9a29-ea55fb7939b3' OR ("EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ca68949f-32c6-4dfa-9a29-ea55fb7939b3', '517DC830-DD35-4756-B1AE-EFF5046B2837' /* Entity: MJ: Rubric Scales */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837'), 'Name', 'Name', 'Unique display name of the scale, e.g. "Likert 1-5" or "Compliance".', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9bdc05f5-82fc-403d-af2f-05aeebca1c9a' OR ("EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9bdc05f5-82fc-403d-af2f-05aeebca1c9a', '517DC830-DD35-4756-B1AE-EFF5046B2837' /* Entity: MJ: Rubric Scales */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837'), 'Description', 'Description', 'What the scale measures and how evaluators should read it.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '72c3bd7a-1339-4394-80c8-e0f386e0f9b6' OR ("EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837' AND "Name" = 'ScaleType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('72c3bd7a-1339-4394-80c8-e0f386e0f9b6', '517DC830-DD35-4756-B1AE-EFF5046B2837' /* Entity: MJ: Rubric Scales */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837'), 'ScaleType', 'Scale Type', 'Levels: answers pick one of the scale''s RubricScaleLevel rows, each carrying its own normalized value. Numeric: answers are a number between MinValue and MaxValue, normalized linearly (inverted when HigherIsBetter = 0).', 'nvarchar', 40, 0, 0, FALSE, 'Levels', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bb70a39d-a396-486c-bcff-f629d91f7115' OR ("EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837' AND "Name" = 'MinValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bb70a39d-a396-486c-bcff-f629d91f7115', '517DC830-DD35-4756-B1AE-EFF5046B2837' /* Entity: MJ: Rubric Scales */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837'), 'MinValue', 'Min Value', 'Lowest allowed answer for a Numeric scale. Required when ScaleType = Numeric.', 'decimal', 9, 18, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1fd7e1aa-84a5-4c7e-a95b-3634cc10691d' OR ("EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837' AND "Name" = 'MaxValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1fd7e1aa-84a5-4c7e-a95b-3634cc10691d', '517DC830-DD35-4756-B1AE-EFF5046B2837' /* Entity: MJ: Rubric Scales */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837'), 'MaxValue', 'Max Value', 'Highest allowed answer for a Numeric scale. Required when ScaleType = Numeric and must exceed MinValue.', 'decimal', 9, 18, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7543e79c-c467-49c6-a3b5-7c0d66022e37' OR ("EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837' AND "Name" = 'Step')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7543e79c-c467-49c6-a3b5-7c0d66022e37', '517DC830-DD35-4756-B1AE-EFF5046B2837' /* Entity: MJ: Rubric Scales */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837'), 'Step', 'Step', 'Optional input increment for a Numeric scale (e.g. 0.5). NULL = any value in range.', 'decimal', 9, 18, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cadcb77c-8755-4262-8775-bd606ba17e7e' OR ("EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837' AND "Name" = 'HigherIsBetter')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cadcb77c-8755-4262-8775-bd606ba17e7e', '517DC830-DD35-4756-B1AE-EFF5046B2837' /* Entity: MJ: Rubric Scales */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837'), 'HigherIsBetter', 'Higher Is Better', 'For Numeric scales: 1 = a higher answer is better (normalizes to a higher score); 0 = lower is better (e.g. error counts), so normalization is inverted.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'db38d905-4c2f-4129-b5fb-d53b046693d0' OR ("EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('db38d905-4c2f-4129-b5fb-d53b046693d0', '517DC830-DD35-4756-B1AE-EFF5046B2837' /* Entity: MJ: Rubric Scales */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837'), 'Status', 'Status', 'Active scales can be chosen for new criteria; Disabled scales stay valid for versions that already use them.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6e59b238-ce3d-470b-adda-23a0cdb5bbfd' OR ("EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6e59b238-ce3d-470b-adda-23a0cdb5bbfd', '517DC830-DD35-4756-B1AE-EFF5046B2837' /* Entity: MJ: Rubric Scales */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4b69393f-7fcb-425e-95b4-b7974cb0d4a2' OR ("EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4b69393f-7fcb-425e-95b4-b7974cb0d4a2', '517DC830-DD35-4756-B1AE-EFF5046B2837' /* Entity: MJ: Rubric Scales */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '517DC830-DD35-4756-B1AE-EFF5046B2837'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '429296ec-c6a4-4b29-9c81-16fe091a15b4' OR ("EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('429296ec-c6a4-4b29-9c81-16fe091a15b4', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' /* Entity: MJ: Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cb5ae6b7-8b8b-4655-9f32-c62720742081' OR ("EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cb5ae6b7-8b8b-4655-9f32-c62720742081', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' /* Entity: MJ: Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2'), 'Name', 'Name', 'Unique display name of the rubric.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1354d708-1b28-443b-a144-bd929a1e167f' OR ("EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1354d708-1b28-443b-a144-bd929a1e167f', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' /* Entity: MJ: Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2'), 'Description', 'Description', 'What the rubric evaluates and when to use it.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '57dd9c6c-9b1d-4a4b-9401-20eef659d124' OR ("EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' AND "Name" = 'CategoryID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('57dd9c6c-9b1d-4a4b-9401-20eef659d124', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' /* Entity: MJ: Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2'), 'CategoryID', 'Category ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f71b130c-5158-446d-8a5f-27ba003e0491' OR ("EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f71b130c-5158-446d-8a5f-27ba003e0491', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' /* Entity: MJ: Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2'), 'Status', 'Status', 'Active rubrics can be assigned and evaluated against; Disabled rubrics keep their history but are not offered for new use.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '39791552-2a47-4745-8058-402d22c9bb58' OR ("EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('39791552-2a47-4745-8058-402d22c9bb58', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' /* Entity: MJ: Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1619da05-c9f6-469e-971e-3e57b50786bb' OR ("EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1619da05-c9f6-469e-971e-3e57b50786bb', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' /* Entity: MJ: Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID d48b7f7a-c377-4a70-979d-63d80c5a3806 */
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
    'd48b7f7a-c377-4a70-979d-63d80c5a3806',
    '710875CF-A1AC-4264-A9CE-BFA78F90F004',
    1,
    'Draft',
    'Draft',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 482cf133-6f06-4fa5-bc65-8f0ced92f115 */
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
    '482cf133-6f06-4fa5-bc65-8f0ced92f115',
    '710875CF-A1AC-4264-A9CE-BFA78F90F004',
    2,
    'Published',
    'Published',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6038fb2b-9132-4619-9ed0-9ebb9a55a8c6 */
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
    '6038fb2b-9132-4619-9ed0-9ebb9a55a8c6',
    '710875CF-A1AC-4264-A9CE-BFA78F90F004',
    3,
    'Retired',
    'Retired',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 710875CF-A1AC-4264-A9CE-BFA78F90F004 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '710875CF-A1AC-4264-A9CE-BFA78F90F004';
/* SQL text to insert entity field value with ID 9d214b01-fd55-4468-a324-ceb25debe450 */
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
    '9d214b01-fd55-4468-a324-ceb25debe450',
    '8846FCC7-4AB9-4C98-805A-D3A0D4B49A63',
    1,
    'CountAsZero',
    'CountAsZero',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b27a0cc9-bf6b-4771-83e9-efe86217fe7d */
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
    'b27a0cc9-bf6b-4771-83e9-efe86217fe7d',
    '8846FCC7-4AB9-4C98-805A-D3A0D4B49A63',
    2,
    'ExcludeAndRedistribute',
    'ExcludeAndRedistribute',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a57bcc03-359a-49d0-a25f-5ccdf096bc97 */
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
    'a57bcc03-359a-49d0-a25f-5ccdf096bc97',
    '8846FCC7-4AB9-4C98-805A-D3A0D4B49A63',
    3,
    'FailEvaluation',
    'FailEvaluation',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID bdd4c58b-0a4e-4dce-9896-89e4da030154 */
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
    'bdd4c58b-0a4e-4dce-9896-89e4da030154',
    '8846FCC7-4AB9-4C98-805A-D3A0D4B49A63',
    4,
    'NotAllowed',
    'NotAllowed',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 8846FCC7-4AB9-4C98-805A-D3A0D4B49A63 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '8846FCC7-4AB9-4C98-805A-D3A0D4B49A63';
/* SQL text to insert entity field value with ID 2c302418-7ea6-4161-a9b2-05912ff6c50a */
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
    '2c302418-7ea6-4161-a9b2-05912ff6c50a',
    'CD5B32EA-F814-4626-9D8C-ED1EF5D73709',
    1,
    'Major',
    'Major',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 3baf4a16-c08a-4aa9-b376-0a532231db13 */
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
    '3baf4a16-c08a-4aa9-b376-0a532231db13',
    'CD5B32EA-F814-4626-9D8C-ED1EF5D73709',
    2,
    'Minor',
    'Minor',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 8bbc8810-2c37-46fc-b277-785e9bdc0782 */
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
    '8bbc8810-2c37-46fc-b277-785e9bdc0782',
    'CD5B32EA-F814-4626-9D8C-ED1EF5D73709',
    3,
    'Patch',
    'Patch',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID CD5B32EA-F814-4626-9D8C-ED1EF5D73709 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'CD5B32EA-F814-4626-9D8C-ED1EF5D73709';
/* SQL text to insert entity field value with ID 268ba72e-5dd9-4a0c-9af7-478cc61ecaf8 */
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
    '268ba72e-5dd9-4a0c-9af7-478cc61ecaf8',
    '7B3EE0A3-0E05-4B27-B769-D7688DA3589B',
    1,
    'Initial',
    'Initial',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c4989bb6-23bb-4d30-a02c-57225c0392a5 */
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
    'c4989bb6-23bb-4d30-a02c-57225c0392a5',
    '7B3EE0A3-0E05-4B27-B769-D7688DA3589B',
    2,
    'Major',
    'Major',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 69b8b3f9-d584-41c8-a5b3-d3b3e14afad9 */
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
    '69b8b3f9-d584-41c8-a5b3-d3b3e14afad9',
    '7B3EE0A3-0E05-4B27-B769-D7688DA3589B',
    3,
    'Minor',
    'Minor',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 3ab1d152-9ef2-470e-8e30-dd83d013f5ef */
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
    '3ab1d152-9ef2-470e-8e30-dd83d013f5ef',
    '7B3EE0A3-0E05-4B27-B769-D7688DA3589B',
    4,
    'Patch',
    'Patch',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 7B3EE0A3-0E05-4B27-B769-D7688DA3589B */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '7B3EE0A3-0E05-4B27-B769-D7688DA3589B';
/* SQL text to insert entity field value with ID 72e36f35-e74b-4c21-b5fc-7f452684f316 */
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
    '72e36f35-e74b-4c21-b5fc-7f452684f316',
    'AAE30202-71BC-4F2E-BAFB-42FA651BA334',
    1,
    'Initial',
    'Initial',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 266571b0-7ab1-4f6a-a7fe-ad280e4b786f */
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
    '266571b0-7ab1-4f6a-a7fe-ad280e4b786f',
    'AAE30202-71BC-4F2E-BAFB-42FA651BA334',
    2,
    'Major',
    'Major',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 25b770b7-f89d-447b-9080-09c00a09c099 */
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
    '25b770b7-f89d-447b-9080-09c00a09c099',
    'AAE30202-71BC-4F2E-BAFB-42FA651BA334',
    3,
    'Minor',
    'Minor',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a373eedd-fd11-4897-b6da-b721a06bebee */
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
    'a373eedd-fd11-4897-b6da-b721a06bebee',
    'AAE30202-71BC-4F2E-BAFB-42FA651BA334',
    4,
    'Patch',
    'Patch',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID AAE30202-71BC-4F2E-BAFB-42FA651BA334 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'AAE30202-71BC-4F2E-BAFB-42FA651BA334';
/* SQL text to insert entity field value with ID 9dfbf6d2-2085-4e7e-985d-b637f2a580cd */
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
    '9dfbf6d2-2085-4e7e-985d-b637f2a580cd',
    '24BBBBB9-2BBD-40AA-9239-A4182A4B7D73',
    1,
    'Criterion',
    'Criterion',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 56359912-1c59-49d1-87cb-f6894aba1dbf */
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
    '56359912-1c59-49d1-87cb-f6894aba1dbf',
    '24BBBBB9-2BBD-40AA-9239-A4182A4B7D73',
    2,
    'Group',
    'Group',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 24BBBBB9-2BBD-40AA-9239-A4182A4B7D73 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '24BBBBB9-2BBD-40AA-9239-A4182A4B7D73';
/* SQL text to insert entity field value with ID faa71186-4026-44de-bc00-fd5454440a86 */
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
    'faa71186-4026-44de-bc00-fd5454440a86',
    '14521F7B-19E9-425A-BD56-961FB64BD2FB',
    1,
    'CountAsZero',
    'CountAsZero',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a102ceb6-e425-4925-824b-15eb959987af */
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
    'a102ceb6-e425-4925-824b-15eb959987af',
    '14521F7B-19E9-425A-BD56-961FB64BD2FB',
    2,
    'ExcludeAndRedistribute',
    'ExcludeAndRedistribute',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 67b59b13-eaf3-43ec-8165-5d949cae5d1b */
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
    '67b59b13-eaf3-43ec-8165-5d949cae5d1b',
    '14521F7B-19E9-425A-BD56-961FB64BD2FB',
    3,
    'FailEvaluation',
    'FailEvaluation',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 59b2f00c-463d-46b5-8e38-0e826ffdd0ac */
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
    '59b2f00c-463d-46b5-8e38-0e826ffdd0ac',
    '14521F7B-19E9-425A-BD56-961FB64BD2FB',
    4,
    'NotAllowed',
    'NotAllowed',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 14521F7B-19E9-425A-BD56-961FB64BD2FB */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '14521F7B-19E9-425A-BD56-961FB64BD2FB';
/* SQL text to insert entity field value with ID 6837d0ef-6ab1-46f1-9062-fecc3f057b3c */
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
    '6837d0ef-6ab1-46f1-9062-fecc3f057b3c',
    'E03CF48C-CCF7-4B65-A47D-BCBF5342D59E',
    1,
    'Maximum',
    'Maximum',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 7e1da611-8160-4033-905f-1fcddb0b7d8e */
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
    '7e1da611-8160-4033-905f-1fcddb0b7d8e',
    'E03CF48C-CCF7-4B65-A47D-BCBF5342D59E',
    2,
    'Minimum',
    'Minimum',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4d6403ac-6c12-427b-85a6-7887e73e94b3 */
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
    '4d6403ac-6c12-427b-85a6-7887e73e94b3',
    'E03CF48C-CCF7-4B65-A47D-BCBF5342D59E',
    3,
    'WeightedMean',
    'WeightedMean',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID E03CF48C-CCF7-4B65-A47D-BCBF5342D59E */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'E03CF48C-CCF7-4B65-A47D-BCBF5342D59E';
/* SQL text to insert entity field value with ID e140c258-4748-4ab6-bc60-9c2029d89e6a */
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
    'e140c258-4748-4ab6-bc60-9c2029d89e6a',
    '63079DD1-EE78-4497-863A-0DE2201D7D31',
    1,
    'Error',
    'Error',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a7b7e81b-933d-4595-ac85-b4d265556b49 */
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
    'a7b7e81b-933d-4595-ac85-b4d265556b49',
    '63079DD1-EE78-4497-863A-0DE2201D7D31',
    2,
    'Info',
    'Info',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5ac841fa-4724-4e36-84cf-f37e406fa00b */
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
    '5ac841fa-4724-4e36-84cf-f37e406fa00b',
    '63079DD1-EE78-4497-863A-0DE2201D7D31',
    3,
    'Neutral',
    'Neutral',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0cf46467-c3e4-4b5e-a0f3-187d28a975be */
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
    '0cf46467-c3e4-4b5e-a0f3-187d28a975be',
    '63079DD1-EE78-4497-863A-0DE2201D7D31',
    4,
    'Success',
    'Success',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 703df5fd-39e1-4322-9c79-8a6c361eb571 */
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
    '703df5fd-39e1-4322-9c79-8a6c361eb571',
    '63079DD1-EE78-4497-863A-0DE2201D7D31',
    5,
    'Warning',
    'Warning',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 63079DD1-EE78-4497-863A-0DE2201D7D31 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '63079DD1-EE78-4497-863A-0DE2201D7D31';
/* SQL text to insert entity field value with ID e3ad30dc-0edd-4219-bddd-bc7e07a71363 */
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
    'e3ad30dc-0edd-4219-bddd-bc7e07a71363',
    '2D48F9B7-DF97-44D3-A0AD-554C129E3C0D',
    1,
    'AIPrompt',
    'AIPrompt',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5bc23c34-50bb-42c9-9c24-188f6f4be492 */
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
    '5bc23c34-50bb-42c9-9c24-188f6f4be492',
    '2D48F9B7-DF97-44D3-A0AD-554C129E3C0D',
    2,
    'Agent',
    'Agent',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 87c1f907-4133-4279-a966-23ffce0934b2 */
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
    '87c1f907-4133-4279-a966-23ffce0934b2',
    '2D48F9B7-DF97-44D3-A0AD-554C129E3C0D',
    3,
    'Deterministic',
    'Deterministic',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4ca0b26b-e2ec-4f39-ad60-703fa1285a3a */
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
    '4ca0b26b-e2ec-4f39-ad60-703fa1285a3a',
    '2D48F9B7-DF97-44D3-A0AD-554C129E3C0D',
    4,
    'External',
    'External',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 98957614-5622-4bbc-876a-dcb3310af645 */
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
    '98957614-5622-4bbc-876a-dcb3310af645',
    '2D48F9B7-DF97-44D3-A0AD-554C129E3C0D',
    5,
    'Human',
    'Human',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 770e8733-34f4-4382-9abd-0441ba02ce9b */
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
    '770e8733-34f4-4382-9abd-0441ba02ce9b',
    '2D48F9B7-DF97-44D3-A0AD-554C129E3C0D',
    6,
    'Self',
    'Self',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 2D48F9B7-DF97-44D3-A0AD-554C129E3C0D */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '2D48F9B7-DF97-44D3-A0AD-554C129E3C0D';
/* SQL text to insert entity field value with ID 7a3ba339-0003-4c1d-850c-7e4c1d27b18d */
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
    '7a3ba339-0003-4c1d-850c-7e4c1d27b18d',
    '9FDDD026-6DBE-41D6-891E-6121D865F250',
    1,
    'Draft',
    'Draft',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 235dd422-2b6b-4296-bca2-bac281251ef4 */
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
    '235dd422-2b6b-4296-bca2-bac281251ef4',
    '9FDDD026-6DBE-41D6-891E-6121D865F250',
    2,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ce833f41-828c-4855-b846-5bd05775b501 */
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
    'ce833f41-828c-4855-b846-5bd05775b501',
    '9FDDD026-6DBE-41D6-891E-6121D865F250',
    3,
    'Submitted',
    'Submitted',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 018a2964-90ef-4418-92b3-ff64df9faa34 */
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
    '018a2964-90ef-4418-92b3-ff64df9faa34',
    '9FDDD026-6DBE-41D6-891E-6121D865F250',
    4,
    'Superseded',
    'Superseded',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 9b6c20fa-7aaf-4477-9e25-a0e0262aee7c */
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
    '9b6c20fa-7aaf-4477-9e25-a0e0262aee7c',
    '9FDDD026-6DBE-41D6-891E-6121D865F250',
    5,
    'Withdrawn',
    'Withdrawn',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 9FDDD026-6DBE-41D6-891E-6121D865F250 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '9FDDD026-6DBE-41D6-891E-6121D865F250';
/* SQL text to insert entity field value with ID 6c4241be-3502-429f-809d-7dafc8642557 */
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
    '6c4241be-3502-429f-809d-7dafc8642557',
    'E88E0661-2D97-4A97-A6FE-512CE09B0DA1',
    1,
    'BelowThreshold',
    'BelowThreshold',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 7e480e8b-097f-459d-b7ec-14f64727805e */
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
    '7e480e8b-097f-459d-b7ec-14f64727805e',
    'E88E0661-2D97-4A97-A6FE-512CE09B0DA1',
    2,
    'GateFailed',
    'GateFailed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 192692d8-bde9-4929-83d1-33038cb5a250 */
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
    '192692d8-bde9-4929-83d1-33038cb5a250',
    'E88E0661-2D97-4A97-A6FE-512CE09B0DA1',
    3,
    'Incomplete',
    'Incomplete',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f54f11df-b107-489b-a105-33c78393dc17 */
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
    'f54f11df-b107-489b-a105-33c78393dc17',
    'E88E0661-2D97-4A97-A6FE-512CE09B0DA1',
    4,
    'NotApplicableFailure',
    'NotApplicableFailure',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID aad65f36-8002-4909-85c7-23d1028edf8e */
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
    'aad65f36-8002-4909-85c7-23d1028edf8e',
    'E88E0661-2D97-4A97-A6FE-512CE09B0DA1',
    5,
    'Passed',
    'Passed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b843928d-2df6-4b80-90f1-3e9d6cfbcffd */
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
    'b843928d-2df6-4b80-90f1-3e9d6cfbcffd',
    'E88E0661-2D97-4A97-A6FE-512CE09B0DA1',
    6,
    'Scored',
    'Scored',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID E88E0661-2D97-4A97-A6FE-512CE09B0DA1 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'E88E0661-2D97-4A97-A6FE-512CE09B0DA1';
/* SQL text to insert entity field value with ID bf84742d-0f66-4366-879c-3188fcc1b1e9 */
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
    'bf84742d-0f66-4366-879c-3188fcc1b1e9',
    'F84FA88E-34A6-42AA-8600-1620A42AF584',
    1,
    'Evaluation',
    'Evaluation',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID d54f344a-13c0-48f5-b01c-e585d037b214 */
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
    'd54f344a-13c0-48f5-b01c-e585d037b214',
    'F84FA88E-34A6-42AA-8600-1620A42AF584',
    2,
    'ProductionSampling',
    'ProductionSampling',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 66d12b81-1fa0-484e-aa93-38c1a36a7d04 */
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
    '66d12b81-1fa0-484e-aa93-38c1a36a7d04',
    'F84FA88E-34A6-42AA-8600-1620A42AF584',
    3,
    'SelfCheck',
    'SelfCheck',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID F84FA88E-34A6-42AA-8600-1620A42AF584 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'F84FA88E-34A6-42AA-8600-1620A42AF584';
/* SQL text to insert entity field value with ID 4a25f4b3-5eef-409b-b105-91ae5c177e4c */
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
    '4a25f4b3-5eef-409b-b105-91ae5c177e4c',
    'D8F9F292-A7F5-49A1-8047-1DF529856653',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6170b892-c5eb-408c-bab4-c7843485ff7d */
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
    '6170b892-c5eb-408c-bab4-c7843485ff7d',
    'D8F9F292-A7F5-49A1-8047-1DF529856653',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID D8F9F292-A7F5-49A1-8047-1DF529856653 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'D8F9F292-A7F5-49A1-8047-1DF529856653';
/* SQL text to insert entity field value with ID a12b6e9a-9a75-4fdd-af48-fbace6d6a989 */
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
    'a12b6e9a-9a75-4fdd-af48-fbace6d6a989',
    '72C3BD7A-1339-4394-80C8-E0F386E0F9B6',
    1,
    'Levels',
    'Levels',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID fca75f60-544c-4dbf-83bb-2547cc5c55a5 */
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
    'fca75f60-544c-4dbf-83bb-2547cc5c55a5',
    '72C3BD7A-1339-4394-80C8-E0F386E0F9B6',
    2,
    'Numeric',
    'Numeric',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 72C3BD7A-1339-4394-80C8-E0F386E0F9B6 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '72C3BD7A-1339-4394-80C8-E0F386E0F9B6';
/* SQL text to insert entity field value with ID 25d4580b-e7bb-495c-87d5-2bc6b7837a5e */
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
    '25d4580b-e7bb-495c-87d5-2bc6b7837a5e',
    'DB38D905-4C2F-4129-B5FB-D53B046693D0',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 098b955c-d1b0-430d-a124-bfe2d4c83466 */
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
    '098b955c-d1b0-430d-a124-bfe2d4c83466',
    'DB38D905-4C2F-4129-B5FB-D53B046693D0',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID DB38D905-4C2F-4129-B5FB-D53B046693D0 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'DB38D905-4C2F-4129-B5FB-D53B046693D0';
/* SQL text to insert entity field value with ID 9e5d1abd-be72-455d-b8c7-b8d06070c8e1 */
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
    '9e5d1abd-be72-455d-b8c7-b8d06070c8e1',
    'F71B130C-5158-446D-8A5F-27BA003E0491',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4a0c700b-d324-41a7-b0d2-6e3bd28179cb */
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
    '4a0c700b-d324-41a7-b0d2-6e3bd28179cb',
    'F71B130C-5158-446D-8A5F-27BA003E0491',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID F71B130C-5158-446D-8A5F-27BA003E0491 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'F71B130C-5158-446D-8A5F-27BA003E0491';
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
/* Create Entity Relationship: MJ: Rubric Bands -> MJ: Rubric Evaluations (One To Many via BandID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5464609b-754d-4a38-a6c1-9c309293b1c5') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5464609b-754d-4a38-a6c1-9c309293b1c5', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107', '7FAA091D-C1A3-48A7-82D2-3D17729470F9', 'BandID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'fec99763-171c-4076-9cfa-e1cfa0ae1292') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fec99763-171c-4076-9cfa-e1cfa0ae1292', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D', 'ParentID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6f04ad98-c35f-42e1-9202-68ad8e2b90a4') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6f04ad98-c35f-42e1-9202-68ad8e2b90a4', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7', 'CriterionID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7f26fda5-f229-4aec-8daf-2d329f21c088') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7f26fda5-f229-4aec-8daf-2d329f21c088', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D', '122ED707-2BC0-42E8-B25F-6BDDE7164962', 'CriterionID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '485f01f8-15d9-4b00-9d90-ac7e00dc7993') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('485f01f8-15d9-4b00-9d90-ac7e00dc7993', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '7FAA091D-C1A3-48A7-82D2-3D17729470F9', 'AIAgentRunID', 'One To Many', TRUE, TRUE, 16, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '449ca424-12a8-4c46-a9e0-eab911ef7d2f') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('449ca424-12a8-4c46-a9e0-eab911ef7d2f', 'A60434B6-1893-45ED-9ECB-169EE8FE6241', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107', 'RubricVersionID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6a4024f0-6b53-4c1e-a0fa-888e89fc1c4c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6a4024f0-6b53-4c1e-a0fa-888e89fc1c4c', 'A60434B6-1893-45ED-9ECB-169EE8FE6241', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D', 'RubricVersionID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '091c1fa3-b0c0-4e2b-b94e-5064c7febf44') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('091c1fa3-b0c0-4e2b-b94e-5064c7febf44', 'A60434B6-1893-45ED-9ECB-169EE8FE6241', 'A60434B6-1893-45ED-9ECB-169EE8FE6241', 'BasedOnVersionID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9e250faf-ec75-4429-a3cc-4c35dfda4135') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9e250faf-ec75-4429-a3cc-4c35dfda4135', 'A60434B6-1893-45ED-9ECB-169EE8FE6241', '7FAA091D-C1A3-48A7-82D2-3D17729470F9', 'RubricVersionID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '222fa6dc-5504-419b-8827-4b5cafac0721') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('222fa6dc-5504-419b-8827-4b5cafac0721', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3', 'AgentID', 'One To Many', TRUE, TRUE, 40, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'de84dac3-fa4b-4d84-9d14-79bb8d87d238') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('de84dac3-fa4b-4d84-9d14-79bb8d87d238', '7FAA091D-C1A3-48A7-82D2-3D17729470F9', '7FAA091D-C1A3-48A7-82D2-3D17729470F9', 'SupersedesEvaluationID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b5cfbc91-ce8d-410f-b181-1148fbfdd1ac') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b5cfbc91-ce8d-410f-b181-1148fbfdd1ac', '7FAA091D-C1A3-48A7-82D2-3D17729470F9', '122ED707-2BC0-42E8-B25F-6BDDE7164962', 'EvaluationID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '394276a7-6629-4954-abe3-84c1bec3523f') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('394276a7-6629-4954-abe3-84c1bec3523f', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '7FAA091D-C1A3-48A7-82D2-3D17729470F9', 'SubjectEntityID', 'One To Many', TRUE, TRUE, 80, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '3391d1d9-25fe-4e99-95be-43f7e5507c18') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3391d1d9-25fe-4e99-95be-43f7e5507c18', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '7FAA091D-C1A3-48A7-82D2-3D17729470F9', 'ContextEntityID', 'One To Many', TRUE, TRUE, 81, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'db0529d5-8363-48ad-b2d4-7f1a086bf955') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('db0529d5-8363-48ad-b2d4-7f1a086bf955', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'A60434B6-1893-45ED-9ECB-169EE8FE6241', 'PublishedByUserID', 'One To Many', TRUE, TRUE, 108, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '37fb1793-4f6e-49c5-afcb-62935cf05a22') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('37fb1793-4f6e-49c5-afcb-62935cf05a22', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '7FAA091D-C1A3-48A7-82D2-3D17729470F9', 'EvaluatorUserID', 'One To Many', TRUE, TRUE, 109, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '50279da1-292f-409c-a872-472131fbe571') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('50279da1-292f-409c-a872-472131fbe571', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A', 'ParentID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '11ef2116-9d20-4075-86d3-8ded7eb3b4eb') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('11ef2116-9d20-4075-86d3-8ded7eb3b4eb', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2', 'CategoryID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f79ae33e-7166-4052-b790-aa32e207310b') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f79ae33e-7166-4052-b790-aa32e207310b', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7', 'ScaleLevelID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a271f6d3-aa85-4ff4-8b9d-0500c07ae0e3') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a271f6d3-aa85-4ff4-8b9d-0500c07ae0e3', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E', '122ED707-2BC0-42E8-B25F-6BDDE7164962', 'ScaleLevelID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '65608082-f622-458f-b94c-06875f3f695c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('65608082-f622-458f-b94c-06875f3f695c', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '7FAA091D-C1A3-48A7-82D2-3D17729470F9', 'AIPromptRunID', 'One To Many', TRUE, TRUE, 10, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b528dd03-ed6d-4c37-88cb-5bf70cc18bf1') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b528dd03-ed6d-4c37-88cb-5bf70cc18bf1', '517DC830-DD35-4756-B1AE-EFF5046B2837', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D', 'ScaleID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6af5dd32-c322-4c72-b602-64a53f8be00b') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6af5dd32-c322-4c72-b602-64a53f8be00b', '517DC830-DD35-4756-B1AE-EFF5046B2837', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E', 'ScaleID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'da0ee7c0-5f9b-4626-bd05-17aecbc99984') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('da0ee7c0-5f9b-4626-bd05-17aecbc99984', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2', '1F949AD0-8C72-4846-8A0B-0B3D9F644231', 'RubricID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0ee96c4f-d882-4d2e-b1ea-b8d6e37c78fe') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0ee96c4f-d882-4d2e-b1ea-b8d6e37c78fe', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2', 'A60434B6-1893-45ED-9ECB-169EE8FE6241', 'RubricID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '37c16078-7cd6-410e-845c-f646dc3602cf') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('37c16078-7cd6-410e-845c-f646dc3602cf', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2', '8FC868B5-778D-4282-BBAB-91C01F863C83', 'RubricID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '512dc0db-1b82-4fab-a101-440ed521f263') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('512dc0db-1b82-4fab-a101-440ed521f263', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3', 'RubricID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44800315-8bb3-42af-8595-27425e5c6e79' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'Parent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('44800315-8bb3-42af-8595-27425e5c6e79', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'Parent', 'Parent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '19fcba36-e7aa-4fb0-b123-1ab00d9e18e0' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'Scale')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('19fcba36-e7aa-4fb0-b123-1ab00d9e18e0', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'Scale', 'Scale', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c6132ad8-4974-4066-8c5f-dc7c087d2e03' OR ("EntityID" = '1F949AD0-8C72-4846-8A0B-0B3D9F644231' AND "Name" = 'Rubric')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c6132ad8-4974-4066-8c5f-dc7c087d2e03', '1F949AD0-8C72-4846-8A0B-0B3D9F644231' /* Entity: MJ: Tests */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1F949AD0-8C72-4846-8A0B-0B3D9F644231'), 'Rubric', 'Rubric', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b0d83a2b-b567-4c42-b7cb-ac04e7ccfd4a' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'Rubric')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b0d83a2b-b567-4c42-b7cb-ac04e7ccfd4a', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'Rubric', 'Rubric', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '082c54d4-0632-4b2e-add4-9c4e9099af18' OR ("EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241' AND "Name" = 'PublishedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('082c54d4-0632-4b2e-add4-9c4e9099af18', 'A60434B6-1893-45ED-9ECB-169EE8FE6241' /* Entity: MJ: Rubric Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A60434B6-1893-45ED-9ECB-169EE8FE6241'), 'PublishedByUser', 'Published By User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c8efb209-4e8b-447c-8b0e-50d13b17e31f' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'SubjectEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c8efb209-4e8b-447c-8b0e-50d13b17e31f', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'SubjectEntity', 'Subject Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6d9eaae3-00a3-4641-ad15-eadf9b1a17e8' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'ContextEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6d9eaae3-00a3-4641-ad15-eadf9b1a17e8', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'ContextEntity', 'Context Entity', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '812c48c3-b060-4fcd-8bd8-fe90812ad357' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'EvaluatorUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('812c48c3-b060-4fcd-8bd8-fe90812ad357', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'EvaluatorUser', 'Evaluator User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f6bb383-9cef-414c-864d-ecc94ab8024c' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'AIPromptRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5f6bb383-9cef-414c-864d-ecc94ab8024c', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'AIPromptRun', 'AI Prompt Run', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'af4d9a75-cb5e-4b43-b013-2ee05ef47a10' OR ("EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9' AND "Name" = 'AIAgentRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('af4d9a75-cb5e-4b43-b013-2ee05ef47a10', '7FAA091D-C1A3-48A7-82D2-3D17729470F9' /* Entity: MJ: Rubric Evaluations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'), 'AIAgentRun', 'AI Agent Run', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c2ee331f-26a4-410b-b881-423b3053791c' OR ("EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' AND "Name" = 'Criterion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c2ee331f-26a4-410b-b881-423b3053791c', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7' /* Entity: MJ: Rubric Criterion Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7'), 'Criterion', 'Criterion', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8ee2ce57-8c50-44f6-b050-39244875f8dc' OR ("EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962' AND "Name" = 'Criterion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8ee2ce57-8c50-44f6-b050-39244875f8dc', '122ED707-2BC0-42E8-B25F-6BDDE7164962' /* Entity: MJ: Rubric Evaluation Scores */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'), 'Criterion', 'Criterion', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3d939b0f-8a46-48ce-928c-4165a00bc6c2' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = 'Parent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3d939b0f-8a46-48ce-928c-4165a00bc6c2', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), 'Parent', 'Parent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9c2a0cad-6c18-46f3-90de-2ea46a7b37de' OR ("EntityID" = '8FC868B5-778D-4282-BBAB-91C01F863C83' AND "Name" = 'Rubric')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9c2a0cad-6c18-46f3-90de-2ea46a7b37de', '8FC868B5-778D-4282-BBAB-91C01F863C83' /* Entity: MJ: Test Suites */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8FC868B5-778D-4282-BBAB-91C01F863C83'), 'Rubric', 'Rubric', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2382f596-ecb2-4a8f-9149-e17864521df3' OR ("EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' AND "Name" = 'Scale')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2382f596-ecb2-4a8f-9149-e17864521df3', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E' /* Entity: MJ: Rubric Scale Levels */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E'), 'Scale', 'Scale', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f20ad351-cd52-4546-a73a-c27bd2c5fc0b' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'Agent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f20ad351-cd52-4546-a73a-c27bd2c5fc0b', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'Agent', 'Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dab58fef-0f1b-4d95-b2bc-11e1cfe70e94' OR ("EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' AND "Name" = 'Rubric')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dab58fef-0f1b-4d95-b2bc-11e1cfe70e94', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3' /* Entity: MJ: AI Agent Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3'), 'Rubric', 'Rubric', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '012da57c-45ee-4a7d-a170-4d270a662b29' OR ("EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' AND "Name" = 'Category')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('012da57c-45ee-4a7d-a170-4d270a662b29', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2' /* Entity: MJ: Rubrics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2'), 'Category', 'Category', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b35dde8a-a552-4533-9b02-237b23031cdf' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'RootParentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b35dde8a-a552-4533-9b02-237b23031cdf', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'RootParentID', 'Root Parent ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd5442455-590a-4de8-90bd-bc2ca1355781' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'ParentIDDepth')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d5442455-590a-4de8-90bd-bc2ca1355781', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'ParentIDDepth', 'Parent ID Depth', NULL, 'int', 4, 10, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8b598271-ab74-479e-b24d-87ae96c8afd3' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'ParentIDPath')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8b598271-ab74-479e-b24d-87ae96c8afd3', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'ParentIDPath', 'Parent ID Path', NULL, 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f898484a-0688-414b-a89e-cde292ef905f' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'ParentIDIsLeaf')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f898484a-0688-414b-a89e-cde292ef905f', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'ParentIDIsLeaf', 'Parent ID Is Leaf', NULL, 'bit', 1, 1, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b8f256a0-1175-433d-a6a0-8e2c49f722a8' OR ("EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' AND "Name" = 'ParentIDChildCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b8f256a0-1175-433d-a6a0-8e2c49f722a8', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D' /* Entity: MJ: Rubric Criteria */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D'), 'ParentIDChildCount', 'Parent ID Child Count', NULL, 'int', 4, 10, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '590b60ed-8ecf-44d0-80e8-f65c6906799d' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = 'RootParentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('590b60ed-8ecf-44d0-80e8-f65c6906799d', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), 'RootParentID', 'Root Parent ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '905540c7-7960-4276-a884-e681072afb3c' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = 'ParentIDDepth')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('905540c7-7960-4276-a884-e681072afb3c', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), 'ParentIDDepth', 'Parent ID Depth', NULL, 'int', 4, 10, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0b8fe376-016e-430f-9492-b9680f6abfd5' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = 'ParentIDPath')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0b8fe376-016e-430f-9492-b9680f6abfd5', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), 'ParentIDPath', 'Parent ID Path', NULL, 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '52575fcf-74e3-464e-a093-271cd420d12d' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = 'ParentIDIsLeaf')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('52575fcf-74e3-464e-a093-271cd420d12d', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), 'ParentIDIsLeaf', 'Parent ID Is Leaf', NULL, 'bit', 1, 1, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8433b91-26cd-49ec-9eac-008f97d7a2b8' OR ("EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' AND "Name" = 'ParentIDChildCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d8433b91-26cd-49ec-9eac-008f97d7a2b8', 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A' /* Entity: MJ: Rubric Categories */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C0057D48-1B9D-452F-ABFF-8C2774E1AF9A'), 'ParentIDChildCount', 'Parent ID Child Count', NULL, 'int', 4, 10, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Rubrics
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_rubric_agent_id"
    ON "__mj"."AIAgentRubric" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_rubric_rubric_id"
    ON "__mj"."AIAgentRubric" ("RubricID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Rubrics
-- Item: vwAIAgentRubrics
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Rubrics
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRubric
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentRubrics"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJRubric_RubricID."Name" AS "Rubric"
FROM
    "__mj"."AIAgentRubric" AS a
INNER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
INNER JOIN
    "__mj"."Rubric" AS MJRubric_RubricID
  ON
    "a"."RubricID" = MJRubric_RubricID."ID"
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
        AND tc.relname = 'vwAIAgentRubrics'
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
                           AND tc.relname = 'vwAIAgentRubrics'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentRubrics" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIAgentRubrics" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentRubrics" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentRubrics" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Rubrics
-- Item: spCreateAIAgentRubric
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRubric
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRubric'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRubric"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_rubricid UUID DEFAULT NULL,
    p_purpose varchar(30) DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_passthreshold_clear boolean DEFAULT false,
    p_passthreshold decimal(9, 6) DEFAULT NULL,
    p_samplerate_clear boolean DEFAULT false,
    p_samplerate decimal(9, 6) DEFAULT NULL,
    p_maxselfcheckattempts_clear boolean DEFAULT false,
    p_maxselfcheckattempts int DEFAULT NULL,
    p_evaluatorconfig_clear boolean DEFAULT false,
    p_evaluatorconfig TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRubrics" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentRubric"
        (
            "ID",
            "AgentID",
                "RubricID",
                "Purpose",
                "IsDefault",
                "Status",
                "PassThreshold",
                "SampleRate",
                "MaxSelfCheckAttempts",
                "EvaluatorConfig",
                "Sequence"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_rubricid,
                p_purpose,
                COALESCE(p_isdefault, FALSE),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_passthreshold_clear = true THEN NULL ELSE COALESCE(p_passthreshold, NULL) END,
                CASE WHEN p_samplerate_clear = true THEN NULL ELSE COALESCE(p_samplerate, NULL) END,
                CASE WHEN p_maxselfcheckattempts_clear = true THEN NULL ELSE COALESCE(p_maxselfcheckattempts, NULL) END,
                CASE WHEN p_evaluatorconfig_clear = true THEN NULL ELSE COALESCE(p_evaluatorconfig, NULL) END,
                COALESCE(p_sequence, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRubrics"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRubric" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRubric" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Rubrics
-- Item: spUpdateAIAgentRubric
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRubric
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRubric'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentRubric"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_rubricid UUID DEFAULT NULL,
    p_purpose varchar(30) DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_passthreshold_clear boolean DEFAULT false,
    p_passthreshold decimal(9, 6) DEFAULT NULL,
    p_samplerate_clear boolean DEFAULT false,
    p_samplerate decimal(9, 6) DEFAULT NULL,
    p_maxselfcheckattempts_clear boolean DEFAULT false,
    p_maxselfcheckattempts int DEFAULT NULL,
    p_evaluatorconfig_clear boolean DEFAULT false,
    p_evaluatorconfig TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRubrics" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentRubric"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "RubricID" = COALESCE(p_rubricid, "RubricID"),
        "Purpose" = COALESCE(p_purpose, "Purpose"),
        "IsDefault" = COALESCE(p_isdefault, "IsDefault"),
        "Status" = COALESCE(p_status, "Status"),
        "PassThreshold" = CASE WHEN p_passthreshold_clear = true THEN NULL ELSE COALESCE(p_passthreshold, "PassThreshold") END,
        "SampleRate" = CASE WHEN p_samplerate_clear = true THEN NULL ELSE COALESCE(p_samplerate, "SampleRate") END,
        "MaxSelfCheckAttempts" = CASE WHEN p_maxselfcheckattempts_clear = true THEN NULL ELSE COALESCE(p_maxselfcheckattempts, "MaxSelfCheckAttempts") END,
        "EvaluatorConfig" = CASE WHEN p_evaluatorconfig_clear = true THEN NULL ELSE COALESCE(p_evaluatorconfig, "EvaluatorConfig") END,
        "Sequence" = COALESCE(p_sequence, "Sequence")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRubrics"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRubric" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRubric" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRubric table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_rubric"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_rubric" ON "__mj"."AIAgentRubric";

CREATE TRIGGER "trg_update_ai_agent_rubric"
BEFORE UPDATE ON "__mj"."AIAgentRubric"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_rubric"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Rubrics
-- Item: spDeleteAIAgentRubric
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRubric
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRubric'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentRubric"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIAgentRubric"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRubric" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRubric" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Bands
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_band_rubric_version_id"
    ON "__mj"."RubricBand" ("RubricVersionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Bands
-- Item: vwRubricBands
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Bands
-----               SCHEMA:      __mj
-----               BASE TABLE:  RubricBand
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRubricBands"
AS
SELECT
    r.*
FROM
    "__mj"."RubricBand" AS r
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
        AND tc.relname = 'vwRubricBands'
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
                           AND tc.relname = 'vwRubricBands'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRubricBands" CASCADE;
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
GRANT SELECT ON "__mj"."vwRubricBands" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRubricBands" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRubricBands" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Bands
-- Item: spCreateRubricBand
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RubricBand
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRubricBand'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRubricBand"(
    p_id UUID DEFAULT NULL,
    p_rubricversionid UUID DEFAULT NULL,
    p_label varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_minscore decimal(9, 6) DEFAULT NULL,
    p_maxscore decimal(9, 6) DEFAULT NULL,
    p_displaytone varchar(20) DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricBands" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RubricBand"
        (
            "ID",
            "RubricVersionID",
                "Label",
                "Description",
                "MinScore",
                "MaxScore",
                "DisplayTone",
                "Sequence"
        )
    VALUES
        (
            v_new_id,
            p_rubricversionid,
                p_label,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_minscore,
                p_maxscore,
                COALESCE(p_displaytone, 'Neutral'),
                COALESCE(p_sequence, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricBands"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricBand" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricBand" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Bands
-- Item: spUpdateRubricBand
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RubricBand
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRubricBand'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRubricBand"(
    p_id UUID,
    p_rubricversionid UUID DEFAULT NULL,
    p_label varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_minscore decimal(9, 6) DEFAULT NULL,
    p_maxscore decimal(9, 6) DEFAULT NULL,
    p_displaytone varchar(20) DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricBands" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RubricBand"
    SET
        "RubricVersionID" = COALESCE(p_rubricversionid, "RubricVersionID"),
        "Label" = COALESCE(p_label, "Label"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "MinScore" = COALESCE(p_minscore, "MinScore"),
        "MaxScore" = COALESCE(p_maxscore, "MaxScore"),
        "DisplayTone" = COALESCE(p_displaytone, "DisplayTone"),
        "Sequence" = COALESCE(p_sequence, "Sequence")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricBands"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricBand" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricBand" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricBand table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_rubric_band"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_rubric_band" ON "__mj"."RubricBand";

CREATE TRIGGER "trg_update_rubric_band"
BEFORE UPDATE ON "__mj"."RubricBand"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_rubric_band"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Bands
-- Item: spDeleteRubricBand
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RubricBand
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRubricBand'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRubricBand"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RubricBand"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricBand" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricBand" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_category_parent_id"
    ON "__mj"."RubricCategory" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: vwRubricCategories
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Categories
-----               SCHEMA:      __mj
-----               BASE TABLE:  RubricCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRubricCategories"
AS
SELECT
    r.*,
    MJRubricCategory_ParentID."Name" AS "Parent"
FROM
    "__mj"."RubricCategory" AS r
LEFT OUTER JOIN
    "__mj"."RubricCategory" AS MJRubricCategory_ParentID
  ON
    "r"."ParentID" = MJRubricCategory_ParentID."ID"
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
        AND tc.relname = 'vwRubricCategories'
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
                           AND tc.relname = 'vwRubricCategories'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRubricCategories" CASCADE;
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
GRANT SELECT ON "__mj"."vwRubricCategories" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRubricCategories" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRubricCategories" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: spCreateRubricCategory
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RubricCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRubricCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRubricCategory"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricCategories" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RubricCategory"
        (
            "ID",
            "Name",
                "Description",
                "ParentID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricCategories"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricCategory" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: spUpdateRubricCategory
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RubricCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRubricCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRubricCategory"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricCategories" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RubricCategory"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricCategories"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricCategory" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricCategory table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_rubric_category"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_rubric_category" ON "__mj"."RubricCategory";

CREATE TRIGGER "trg_update_rubric_category"
BEFORE UPDATE ON "__mj"."RubricCategory"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_rubric_category"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Categories
-- Item: spDeleteRubricCategory
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RubricCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRubricCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRubricCategory"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RubricCategory"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricCategory" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_criterion_rubric_version_id"
    ON "__mj"."RubricCriterion" ("RubricVersionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_criterion_parent_id"
    ON "__mj"."RubricCriterion" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_criterion_scale_id"
    ON "__mj"."RubricCriterion" ("ScaleID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: vwRubricCriteria
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Criteria
-----               SCHEMA:      __mj
-----               BASE TABLE:  RubricCriterion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRubricCriteria"
AS
SELECT
    r.*,
    MJRubricCriterion_ParentID."Name" AS "Parent",
    MJRubricScale_ScaleID."Name" AS "Scale"
FROM
    "__mj"."RubricCriterion" AS r
LEFT OUTER JOIN
    "__mj"."RubricCriterion" AS MJRubricCriterion_ParentID
  ON
    "r"."ParentID" = MJRubricCriterion_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."RubricScale" AS MJRubricScale_ScaleID
  ON
    "r"."ScaleID" = MJRubricScale_ScaleID."ID"
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
        AND tc.relname = 'vwRubricCriteria'
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
                           AND tc.relname = 'vwRubricCriteria'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRubricCriteria" CASCADE;
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
GRANT SELECT ON "__mj"."vwRubricCriteria" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRubricCriteria" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRubricCriteria" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: spCreateRubricCriterion
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RubricCriterion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRubricCriterion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRubricCriterion"(
    p_id UUID DEFAULT NULL,
    p_rubricversionid UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_key varchar(100) DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_guidance_clear boolean DEFAULT false,
    p_guidance TEXT DEFAULT NULL,
    p_nodetype varchar(20) DEFAULT NULL,
    p_scaleid_clear boolean DEFAULT false,
    p_scaleid UUID DEFAULT NULL,
    p_weight decimal(18, 6) DEFAULT NULL,
    p_isadvisory BOOLEAN DEFAULT NULL,
    p_isgate BOOLEAN DEFAULT NULL,
    p_gateminimumscore_clear boolean DEFAULT false,
    p_gateminimumscore decimal(9, 6) DEFAULT NULL,
    p_notapplicablepolicy_clear boolean DEFAULT false,
    p_notapplicablepolicy varchar(30) DEFAULT NULL,
    p_rollupmethod_clear boolean DEFAULT false,
    p_rollupmethod varchar(20) DEFAULT NULL,
    p_evidencerequired BOOLEAN DEFAULT NULL,
    p_rationalerequired BOOLEAN DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_evaluatorconfig_clear boolean DEFAULT false,
    p_evaluatorconfig TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricCriteria" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RubricCriterion"
        (
            "ID",
            "RubricVersionID",
                "ParentID",
                "Key",
                "Name",
                "Description",
                "Guidance",
                "NodeType",
                "ScaleID",
                "Weight",
                "IsAdvisory",
                "IsGate",
                "GateMinimumScore",
                "NotApplicablePolicy",
                "RollupMethod",
                "EvidenceRequired",
                "RationaleRequired",
                "Sequence",
                "EvaluatorConfig"
        )
    VALUES
        (
            v_new_id,
            p_rubricversionid,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                p_key,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_guidance_clear = true THEN NULL ELSE COALESCE(p_guidance, NULL) END,
                COALESCE(p_nodetype, 'Criterion'),
                CASE WHEN p_scaleid_clear = true THEN NULL ELSE COALESCE(p_scaleid, NULL) END,
                COALESCE(p_weight, 1),
                COALESCE(p_isadvisory, FALSE),
                COALESCE(p_isgate, FALSE),
                CASE WHEN p_gateminimumscore_clear = true THEN NULL ELSE COALESCE(p_gateminimumscore, NULL) END,
                CASE WHEN p_notapplicablepolicy_clear = true THEN NULL ELSE COALESCE(p_notapplicablepolicy, NULL) END,
                CASE WHEN p_rollupmethod_clear = true THEN NULL ELSE COALESCE(p_rollupmethod, NULL) END,
                COALESCE(p_evidencerequired, FALSE),
                COALESCE(p_rationalerequired, FALSE),
                COALESCE(p_sequence, 0),
                CASE WHEN p_evaluatorconfig_clear = true THEN NULL ELSE COALESCE(p_evaluatorconfig, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricCriteria"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricCriterion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricCriterion" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: spUpdateRubricCriterion
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RubricCriterion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRubricCriterion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRubricCriterion"(
    p_id UUID,
    p_rubricversionid UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_key varchar(100) DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_guidance_clear boolean DEFAULT false,
    p_guidance TEXT DEFAULT NULL,
    p_nodetype varchar(20) DEFAULT NULL,
    p_scaleid_clear boolean DEFAULT false,
    p_scaleid UUID DEFAULT NULL,
    p_weight decimal(18, 6) DEFAULT NULL,
    p_isadvisory BOOLEAN DEFAULT NULL,
    p_isgate BOOLEAN DEFAULT NULL,
    p_gateminimumscore_clear boolean DEFAULT false,
    p_gateminimumscore decimal(9, 6) DEFAULT NULL,
    p_notapplicablepolicy_clear boolean DEFAULT false,
    p_notapplicablepolicy varchar(30) DEFAULT NULL,
    p_rollupmethod_clear boolean DEFAULT false,
    p_rollupmethod varchar(20) DEFAULT NULL,
    p_evidencerequired BOOLEAN DEFAULT NULL,
    p_rationalerequired BOOLEAN DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_evaluatorconfig_clear boolean DEFAULT false,
    p_evaluatorconfig TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricCriteria" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RubricCriterion"
    SET
        "RubricVersionID" = COALESCE(p_rubricversionid, "RubricVersionID"),
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Key" = COALESCE(p_key, "Key"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Guidance" = CASE WHEN p_guidance_clear = true THEN NULL ELSE COALESCE(p_guidance, "Guidance") END,
        "NodeType" = COALESCE(p_nodetype, "NodeType"),
        "ScaleID" = CASE WHEN p_scaleid_clear = true THEN NULL ELSE COALESCE(p_scaleid, "ScaleID") END,
        "Weight" = COALESCE(p_weight, "Weight"),
        "IsAdvisory" = COALESCE(p_isadvisory, "IsAdvisory"),
        "IsGate" = COALESCE(p_isgate, "IsGate"),
        "GateMinimumScore" = CASE WHEN p_gateminimumscore_clear = true THEN NULL ELSE COALESCE(p_gateminimumscore, "GateMinimumScore") END,
        "NotApplicablePolicy" = CASE WHEN p_notapplicablepolicy_clear = true THEN NULL ELSE COALESCE(p_notapplicablepolicy, "NotApplicablePolicy") END,
        "RollupMethod" = CASE WHEN p_rollupmethod_clear = true THEN NULL ELSE COALESCE(p_rollupmethod, "RollupMethod") END,
        "EvidenceRequired" = COALESCE(p_evidencerequired, "EvidenceRequired"),
        "RationaleRequired" = COALESCE(p_rationalerequired, "RationaleRequired"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "EvaluatorConfig" = CASE WHEN p_evaluatorconfig_clear = true THEN NULL ELSE COALESCE(p_evaluatorconfig, "EvaluatorConfig") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricCriteria"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricCriterion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricCriterion" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricCriterion table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_rubric_criterion"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_rubric_criterion" ON "__mj"."RubricCriterion";

CREATE TRIGGER "trg_update_rubric_criterion"
BEFORE UPDATE ON "__mj"."RubricCriterion"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_rubric_criterion"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criteria
-- Item: spDeleteRubricCriterion
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RubricCriterion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRubricCriterion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRubricCriterion"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RubricCriterion"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricCriterion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricCriterion" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criterion Levels
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_criterion_level_criterion_id"
    ON "__mj"."RubricCriterionLevel" ("CriterionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_criterion_level_scale_level_id"
    ON "__mj"."RubricCriterionLevel" ("ScaleLevelID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criterion Levels
-- Item: vwRubricCriterionLevels
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Criterion Levels
-----               SCHEMA:      __mj
-----               BASE TABLE:  RubricCriterionLevel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRubricCriterionLevels"
AS
SELECT
    r.*,
    MJRubricCriterion_CriterionID."Name" AS "Criterion",
    MJRubricScaleLevel_ScaleLevelID."Label" AS "ScaleLevel"
FROM
    "__mj"."RubricCriterionLevel" AS r
INNER JOIN
    "__mj"."RubricCriterion" AS MJRubricCriterion_CriterionID
  ON
    "r"."CriterionID" = MJRubricCriterion_CriterionID."ID"
LEFT OUTER JOIN
    "__mj"."RubricScaleLevel" AS MJRubricScaleLevel_ScaleLevelID
  ON
    "r"."ScaleLevelID" = MJRubricScaleLevel_ScaleLevelID."ID"
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
        AND tc.relname = 'vwRubricCriterionLevels'
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
                           AND tc.relname = 'vwRubricCriterionLevels'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRubricCriterionLevels" CASCADE;
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
GRANT SELECT ON "__mj"."vwRubricCriterionLevels" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRubricCriterionLevels" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRubricCriterionLevels" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criterion Levels
-- Item: spCreateRubricCriterionLevel
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RubricCriterionLevel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRubricCriterionLevel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRubricCriterionLevel"(
    p_id UUID DEFAULT NULL,
    p_criterionid UUID DEFAULT NULL,
    p_scalelevelid_clear boolean DEFAULT false,
    p_scalelevelid UUID DEFAULT NULL,
    p_anchorvalue_clear boolean DEFAULT false,
    p_anchorvalue decimal(18, 6) DEFAULT NULL,
    p_descriptor TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricCriterionLevels" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RubricCriterionLevel"
        (
            "ID",
            "CriterionID",
                "ScaleLevelID",
                "AnchorValue",
                "Descriptor"
        )
    VALUES
        (
            v_new_id,
            p_criterionid,
                CASE WHEN p_scalelevelid_clear = true THEN NULL ELSE COALESCE(p_scalelevelid, NULL) END,
                CASE WHEN p_anchorvalue_clear = true THEN NULL ELSE COALESCE(p_anchorvalue, NULL) END,
                p_descriptor
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricCriterionLevels"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricCriterionLevel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricCriterionLevel" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criterion Levels
-- Item: spUpdateRubricCriterionLevel
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RubricCriterionLevel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRubricCriterionLevel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRubricCriterionLevel"(
    p_id UUID,
    p_criterionid UUID DEFAULT NULL,
    p_scalelevelid_clear boolean DEFAULT false,
    p_scalelevelid UUID DEFAULT NULL,
    p_anchorvalue_clear boolean DEFAULT false,
    p_anchorvalue decimal(18, 6) DEFAULT NULL,
    p_descriptor TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricCriterionLevels" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RubricCriterionLevel"
    SET
        "CriterionID" = COALESCE(p_criterionid, "CriterionID"),
        "ScaleLevelID" = CASE WHEN p_scalelevelid_clear = true THEN NULL ELSE COALESCE(p_scalelevelid, "ScaleLevelID") END,
        "AnchorValue" = CASE WHEN p_anchorvalue_clear = true THEN NULL ELSE COALESCE(p_anchorvalue, "AnchorValue") END,
        "Descriptor" = COALESCE(p_descriptor, "Descriptor")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricCriterionLevels"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricCriterionLevel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricCriterionLevel" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricCriterionLevel table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_rubric_criterion_level"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_rubric_criterion_level" ON "__mj"."RubricCriterionLevel";

CREATE TRIGGER "trg_update_rubric_criterion_level"
BEFORE UPDATE ON "__mj"."RubricCriterionLevel"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_rubric_criterion_level"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Criterion Levels
-- Item: spDeleteRubricCriterionLevel
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RubricCriterionLevel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRubricCriterionLevel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRubricCriterionLevel"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RubricCriterionLevel"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricCriterionLevel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricCriterionLevel" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Scale Levels
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_scale_level_scale_id"
    ON "__mj"."RubricScaleLevel" ("ScaleID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Scale Levels
-- Item: vwRubricScaleLevels
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Scale Levels
-----               SCHEMA:      __mj
-----               BASE TABLE:  RubricScaleLevel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRubricScaleLevels"
AS
SELECT
    r.*,
    MJRubricScale_ScaleID."Name" AS "Scale"
FROM
    "__mj"."RubricScaleLevel" AS r
INNER JOIN
    "__mj"."RubricScale" AS MJRubricScale_ScaleID
  ON
    "r"."ScaleID" = MJRubricScale_ScaleID."ID"
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
        AND tc.relname = 'vwRubricScaleLevels'
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
                           AND tc.relname = 'vwRubricScaleLevels'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRubricScaleLevels" CASCADE;
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
GRANT SELECT ON "__mj"."vwRubricScaleLevels" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRubricScaleLevels" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRubricScaleLevels" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Scale Levels
-- Item: spCreateRubricScaleLevel
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RubricScaleLevel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRubricScaleLevel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRubricScaleLevel"(
    p_id UUID DEFAULT NULL,
    p_scaleid UUID DEFAULT NULL,
    p_label varchar(100) DEFAULT NULL,
    p_value decimal(18, 6) DEFAULT NULL,
    p_normalizedvalue decimal(9, 6) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricScaleLevels" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RubricScaleLevel"
        (
            "ID",
            "ScaleID",
                "Label",
                "Value",
                "NormalizedValue",
                "Description",
                "Sequence"
        )
    VALUES
        (
            v_new_id,
            p_scaleid,
                p_label,
                p_value,
                p_normalizedvalue,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_sequence, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricScaleLevels"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricScaleLevel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricScaleLevel" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Scale Levels
-- Item: spUpdateRubricScaleLevel
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RubricScaleLevel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRubricScaleLevel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRubricScaleLevel"(
    p_id UUID,
    p_scaleid UUID DEFAULT NULL,
    p_label varchar(100) DEFAULT NULL,
    p_value decimal(18, 6) DEFAULT NULL,
    p_normalizedvalue decimal(9, 6) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricScaleLevels" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RubricScaleLevel"
    SET
        "ScaleID" = COALESCE(p_scaleid, "ScaleID"),
        "Label" = COALESCE(p_label, "Label"),
        "Value" = COALESCE(p_value, "Value"),
        "NormalizedValue" = COALESCE(p_normalizedvalue, "NormalizedValue"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Sequence" = COALESCE(p_sequence, "Sequence")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricScaleLevels"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricScaleLevel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricScaleLevel" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricScaleLevel table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_rubric_scale_level"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_rubric_scale_level" ON "__mj"."RubricScaleLevel";

CREATE TRIGGER "trg_update_rubric_scale_level"
BEFORE UPDATE ON "__mj"."RubricScaleLevel"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_rubric_scale_level"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Scale Levels
-- Item: spDeleteRubricScaleLevel
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RubricScaleLevel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRubricScaleLevel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRubricScaleLevel"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RubricScaleLevel"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricScaleLevel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricScaleLevel" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Scales
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Scales
-- Item: vwRubricScales
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Scales
-----               SCHEMA:      __mj
-----               BASE TABLE:  RubricScale
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRubricScales"
AS
SELECT
    r.*
FROM
    "__mj"."RubricScale" AS r
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
        AND tc.relname = 'vwRubricScales'
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
                           AND tc.relname = 'vwRubricScales'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRubricScales" CASCADE;
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
GRANT SELECT ON "__mj"."vwRubricScales" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRubricScales" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRubricScales" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Scales
-- Item: spCreateRubricScale
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RubricScale
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRubricScale'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRubricScale"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_scaletype varchar(20) DEFAULT NULL,
    p_minvalue_clear boolean DEFAULT false,
    p_minvalue decimal(18, 6) DEFAULT NULL,
    p_maxvalue_clear boolean DEFAULT false,
    p_maxvalue decimal(18, 6) DEFAULT NULL,
    p_step_clear boolean DEFAULT false,
    p_step decimal(18, 6) DEFAULT NULL,
    p_higherisbetter BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricScales" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RubricScale"
        (
            "ID",
            "Name",
                "Description",
                "ScaleType",
                "MinValue",
                "MaxValue",
                "Step",
                "HigherIsBetter",
                "Status"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_scaletype, 'Levels'),
                CASE WHEN p_minvalue_clear = true THEN NULL ELSE COALESCE(p_minvalue, NULL) END,
                CASE WHEN p_maxvalue_clear = true THEN NULL ELSE COALESCE(p_maxvalue, NULL) END,
                CASE WHEN p_step_clear = true THEN NULL ELSE COALESCE(p_step, NULL) END,
                COALESCE(p_higherisbetter, TRUE),
                COALESCE(p_status, 'Active')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricScales"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricScale" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricScale" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Scales
-- Item: spUpdateRubricScale
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RubricScale
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRubricScale'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRubricScale"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_scaletype varchar(20) DEFAULT NULL,
    p_minvalue_clear boolean DEFAULT false,
    p_minvalue decimal(18, 6) DEFAULT NULL,
    p_maxvalue_clear boolean DEFAULT false,
    p_maxvalue decimal(18, 6) DEFAULT NULL,
    p_step_clear boolean DEFAULT false,
    p_step decimal(18, 6) DEFAULT NULL,
    p_higherisbetter BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricScales" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RubricScale"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ScaleType" = COALESCE(p_scaletype, "ScaleType"),
        "MinValue" = CASE WHEN p_minvalue_clear = true THEN NULL ELSE COALESCE(p_minvalue, "MinValue") END,
        "MaxValue" = CASE WHEN p_maxvalue_clear = true THEN NULL ELSE COALESCE(p_maxvalue, "MaxValue") END,
        "Step" = CASE WHEN p_step_clear = true THEN NULL ELSE COALESCE(p_step, "Step") END,
        "HigherIsBetter" = COALESCE(p_higherisbetter, "HigherIsBetter"),
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
    SELECT * FROM "__mj"."vwRubricScales"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricScale" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricScale" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricScale table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_rubric_scale"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_rubric_scale" ON "__mj"."RubricScale";

CREATE TRIGGER "trg_update_rubric_scale"
BEFORE UPDATE ON "__mj"."RubricScale"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_rubric_scale"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Scales
-- Item: spDeleteRubricScale
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RubricScale
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRubricScale'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRubricScale"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RubricScale"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricScale" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricScale" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Versions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_version_rubric_id"
    ON "__mj"."RubricVersion" ("RubricID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_version_based_on_version_id"
    ON "__mj"."RubricVersion" ("BasedOnVersionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_version_published_by_user_id"
    ON "__mj"."RubricVersion" ("PublishedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Versions
-- Item: vwRubricVersions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubric Versions
-----               SCHEMA:      __mj
-----               BASE TABLE:  RubricVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRubricVersions"
AS
SELECT
    r.*,
    MJRubric_RubricID."Name" AS "Rubric",
    MJUser_PublishedByUserID."Name" AS "PublishedByUser"
FROM
    "__mj"."RubricVersion" AS r
INNER JOIN
    "__mj"."Rubric" AS MJRubric_RubricID
  ON
    "r"."RubricID" = MJRubric_RubricID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_PublishedByUserID
  ON
    "r"."PublishedByUserID" = MJUser_PublishedByUserID."ID"
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
        AND tc.relname = 'vwRubricVersions'
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
                           AND tc.relname = 'vwRubricVersions'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRubricVersions" CASCADE;
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
GRANT SELECT ON "__mj"."vwRubricVersions" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRubricVersions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRubricVersions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Versions
-- Item: spCreateRubricVersion
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RubricVersion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRubricVersion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRubricVersion"(
    p_id UUID DEFAULT NULL,
    p_rubricid UUID DEFAULT NULL,
    p_majorversion_clear boolean DEFAULT false,
    p_majorversion int DEFAULT NULL,
    p_minorversion_clear boolean DEFAULT false,
    p_minorversion int DEFAULT NULL,
    p_patchversion_clear boolean DEFAULT false,
    p_patchversion int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_basedonversionid_clear boolean DEFAULT false,
    p_basedonversionid UUID DEFAULT NULL,
    p_instructions_clear boolean DEFAULT false,
    p_instructions TEXT DEFAULT NULL,
    p_passthreshold_clear boolean DEFAULT false,
    p_passthreshold decimal(9, 6) DEFAULT NULL,
    p_minimumcompleteness_clear boolean DEFAULT false,
    p_minimumcompleteness decimal(9, 6) DEFAULT NULL,
    p_notapplicablepolicy varchar(30) DEFAULT NULL,
    p_scoredisplaymin decimal(18, 6) DEFAULT NULL,
    p_scoredisplaymax decimal(18, 6) DEFAULT NULL,
    p_requestedbump_clear boolean DEFAULT false,
    p_requestedbump varchar(10) DEFAULT NULL,
    p_computedbump_clear boolean DEFAULT false,
    p_computedbump varchar(10) DEFAULT NULL,
    p_appliedbump_clear boolean DEFAULT false,
    p_appliedbump varchar(10) DEFAULT NULL,
    p_changesummary_clear boolean DEFAULT false,
    p_changesummary TEXT DEFAULT NULL,
    p_changedetails_clear boolean DEFAULT false,
    p_changedetails TEXT DEFAULT NULL,
    p_contenthash_clear boolean DEFAULT false,
    p_contenthash varchar(64) DEFAULT NULL,
    p_scoringhash_clear boolean DEFAULT false,
    p_scoringhash varchar(64) DEFAULT NULL,
    p_publishedat_clear boolean DEFAULT false,
    p_publishedat TIMESTAMPTZ DEFAULT NULL,
    p_publishedbyuserid_clear boolean DEFAULT false,
    p_publishedbyuserid UUID DEFAULT NULL,
    p_retiredat_clear boolean DEFAULT false,
    p_retiredat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricVersions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RubricVersion"
        (
            "ID",
            "RubricID",
                "MajorVersion",
                "MinorVersion",
                "PatchVersion",
                "Status",
                "BasedOnVersionID",
                "Instructions",
                "PassThreshold",
                "MinimumCompleteness",
                "NotApplicablePolicy",
                "ScoreDisplayMin",
                "ScoreDisplayMax",
                "RequestedBump",
                "ComputedBump",
                "AppliedBump",
                "ChangeSummary",
                "ChangeDetails",
                "ContentHash",
                "ScoringHash",
                "PublishedAt",
                "PublishedByUserID",
                "RetiredAt"
        )
    VALUES
        (
            v_new_id,
            p_rubricid,
                CASE WHEN p_majorversion_clear = true THEN NULL ELSE COALESCE(p_majorversion, NULL) END,
                CASE WHEN p_minorversion_clear = true THEN NULL ELSE COALESCE(p_minorversion, NULL) END,
                CASE WHEN p_patchversion_clear = true THEN NULL ELSE COALESCE(p_patchversion, NULL) END,
                COALESCE(p_status, 'Draft'),
                CASE WHEN p_basedonversionid_clear = true THEN NULL ELSE COALESCE(p_basedonversionid, NULL) END,
                CASE WHEN p_instructions_clear = true THEN NULL ELSE COALESCE(p_instructions, NULL) END,
                CASE WHEN p_passthreshold_clear = true THEN NULL ELSE COALESCE(p_passthreshold, NULL) END,
                CASE WHEN p_minimumcompleteness_clear = true THEN NULL ELSE COALESCE(p_minimumcompleteness, NULL) END,
                COALESCE(p_notapplicablepolicy, 'ExcludeAndRedistribute'),
                COALESCE(p_scoredisplaymin, 0),
                COALESCE(p_scoredisplaymax, 100),
                CASE WHEN p_requestedbump_clear = true THEN NULL ELSE COALESCE(p_requestedbump, NULL) END,
                CASE WHEN p_computedbump_clear = true THEN NULL ELSE COALESCE(p_computedbump, NULL) END,
                CASE WHEN p_appliedbump_clear = true THEN NULL ELSE COALESCE(p_appliedbump, NULL) END,
                CASE WHEN p_changesummary_clear = true THEN NULL ELSE COALESCE(p_changesummary, NULL) END,
                CASE WHEN p_changedetails_clear = true THEN NULL ELSE COALESCE(p_changedetails, NULL) END,
                CASE WHEN p_contenthash_clear = true THEN NULL ELSE COALESCE(p_contenthash, NULL) END,
                CASE WHEN p_scoringhash_clear = true THEN NULL ELSE COALESCE(p_scoringhash, NULL) END,
                CASE WHEN p_publishedat_clear = true THEN NULL ELSE COALESCE(p_publishedat, NULL) END,
                CASE WHEN p_publishedbyuserid_clear = true THEN NULL ELSE COALESCE(p_publishedbyuserid, NULL) END,
                CASE WHEN p_retiredat_clear = true THEN NULL ELSE COALESCE(p_retiredat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricVersions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubricVersion" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Versions
-- Item: spUpdateRubricVersion
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RubricVersion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRubricVersion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRubricVersion"(
    p_id UUID,
    p_rubricid UUID DEFAULT NULL,
    p_majorversion_clear boolean DEFAULT false,
    p_majorversion int DEFAULT NULL,
    p_minorversion_clear boolean DEFAULT false,
    p_minorversion int DEFAULT NULL,
    p_patchversion_clear boolean DEFAULT false,
    p_patchversion int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_basedonversionid_clear boolean DEFAULT false,
    p_basedonversionid UUID DEFAULT NULL,
    p_instructions_clear boolean DEFAULT false,
    p_instructions TEXT DEFAULT NULL,
    p_passthreshold_clear boolean DEFAULT false,
    p_passthreshold decimal(9, 6) DEFAULT NULL,
    p_minimumcompleteness_clear boolean DEFAULT false,
    p_minimumcompleteness decimal(9, 6) DEFAULT NULL,
    p_notapplicablepolicy varchar(30) DEFAULT NULL,
    p_scoredisplaymin decimal(18, 6) DEFAULT NULL,
    p_scoredisplaymax decimal(18, 6) DEFAULT NULL,
    p_requestedbump_clear boolean DEFAULT false,
    p_requestedbump varchar(10) DEFAULT NULL,
    p_computedbump_clear boolean DEFAULT false,
    p_computedbump varchar(10) DEFAULT NULL,
    p_appliedbump_clear boolean DEFAULT false,
    p_appliedbump varchar(10) DEFAULT NULL,
    p_changesummary_clear boolean DEFAULT false,
    p_changesummary TEXT DEFAULT NULL,
    p_changedetails_clear boolean DEFAULT false,
    p_changedetails TEXT DEFAULT NULL,
    p_contenthash_clear boolean DEFAULT false,
    p_contenthash varchar(64) DEFAULT NULL,
    p_scoringhash_clear boolean DEFAULT false,
    p_scoringhash varchar(64) DEFAULT NULL,
    p_publishedat_clear boolean DEFAULT false,
    p_publishedat TIMESTAMPTZ DEFAULT NULL,
    p_publishedbyuserid_clear boolean DEFAULT false,
    p_publishedbyuserid UUID DEFAULT NULL,
    p_retiredat_clear boolean DEFAULT false,
    p_retiredat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubricVersions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RubricVersion"
    SET
        "RubricID" = COALESCE(p_rubricid, "RubricID"),
        "MajorVersion" = CASE WHEN p_majorversion_clear = true THEN NULL ELSE COALESCE(p_majorversion, "MajorVersion") END,
        "MinorVersion" = CASE WHEN p_minorversion_clear = true THEN NULL ELSE COALESCE(p_minorversion, "MinorVersion") END,
        "PatchVersion" = CASE WHEN p_patchversion_clear = true THEN NULL ELSE COALESCE(p_patchversion, "PatchVersion") END,
        "Status" = COALESCE(p_status, "Status"),
        "BasedOnVersionID" = CASE WHEN p_basedonversionid_clear = true THEN NULL ELSE COALESCE(p_basedonversionid, "BasedOnVersionID") END,
        "Instructions" = CASE WHEN p_instructions_clear = true THEN NULL ELSE COALESCE(p_instructions, "Instructions") END,
        "PassThreshold" = CASE WHEN p_passthreshold_clear = true THEN NULL ELSE COALESCE(p_passthreshold, "PassThreshold") END,
        "MinimumCompleteness" = CASE WHEN p_minimumcompleteness_clear = true THEN NULL ELSE COALESCE(p_minimumcompleteness, "MinimumCompleteness") END,
        "NotApplicablePolicy" = COALESCE(p_notapplicablepolicy, "NotApplicablePolicy"),
        "ScoreDisplayMin" = COALESCE(p_scoredisplaymin, "ScoreDisplayMin"),
        "ScoreDisplayMax" = COALESCE(p_scoredisplaymax, "ScoreDisplayMax"),
        "RequestedBump" = CASE WHEN p_requestedbump_clear = true THEN NULL ELSE COALESCE(p_requestedbump, "RequestedBump") END,
        "ComputedBump" = CASE WHEN p_computedbump_clear = true THEN NULL ELSE COALESCE(p_computedbump, "ComputedBump") END,
        "AppliedBump" = CASE WHEN p_appliedbump_clear = true THEN NULL ELSE COALESCE(p_appliedbump, "AppliedBump") END,
        "ChangeSummary" = CASE WHEN p_changesummary_clear = true THEN NULL ELSE COALESCE(p_changesummary, "ChangeSummary") END,
        "ChangeDetails" = CASE WHEN p_changedetails_clear = true THEN NULL ELSE COALESCE(p_changedetails, "ChangeDetails") END,
        "ContentHash" = CASE WHEN p_contenthash_clear = true THEN NULL ELSE COALESCE(p_contenthash, "ContentHash") END,
        "ScoringHash" = CASE WHEN p_scoringhash_clear = true THEN NULL ELSE COALESCE(p_scoringhash, "ScoringHash") END,
        "PublishedAt" = CASE WHEN p_publishedat_clear = true THEN NULL ELSE COALESCE(p_publishedat, "PublishedAt") END,
        "PublishedByUserID" = CASE WHEN p_publishedbyuserid_clear = true THEN NULL ELSE COALESCE(p_publishedbyuserid, "PublishedByUserID") END,
        "RetiredAt" = CASE WHEN p_retiredat_clear = true THEN NULL ELSE COALESCE(p_retiredat, "RetiredAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRubricVersions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubricVersion" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RubricVersion table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_rubric_version"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_rubric_version" ON "__mj"."RubricVersion";

CREATE TRIGGER "trg_update_rubric_version"
BEFORE UPDATE ON "__mj"."RubricVersion"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_rubric_version"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Versions
-- Item: spDeleteRubricVersion
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RubricVersion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRubricVersion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRubricVersion"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RubricVersion"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricVersion" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubrics
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_rubric_category_id"
    ON "__mj"."Rubric" ("CategoryID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubrics
-- Item: vwRubrics
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Rubrics
-----               SCHEMA:      __mj
-----               BASE TABLE:  Rubric
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRubrics"
AS
SELECT
    r.*,
    MJRubricCategory_CategoryID."Name" AS "Category"
FROM
    "__mj"."Rubric" AS r
LEFT OUTER JOIN
    "__mj"."RubricCategory" AS MJRubricCategory_CategoryID
  ON
    "r"."CategoryID" = MJRubricCategory_CategoryID."ID"
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
        AND tc.relname = 'vwRubrics'
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
                           AND tc.relname = 'vwRubrics'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRubrics" CASCADE;
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
GRANT SELECT ON "__mj"."vwRubrics" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRubrics" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRubrics" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubrics
-- Item: spCreateRubric
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Rubric
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRubric'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRubric"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubrics" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Rubric"
        (
            "ID",
            "Name",
                "Description",
                "CategoryID",
                "Status"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                COALESCE(p_status, 'Active')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRubrics"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubric" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRubric" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubrics
-- Item: spUpdateRubric
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Rubric
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRubric'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRubric"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwRubrics" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Rubric"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
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
    SELECT * FROM "__mj"."vwRubrics"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubric" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRubric" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Rubric table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_rubric"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_rubric" ON "__mj"."Rubric";

CREATE TRIGGER "trg_update_rubric"
BEFORE UPDATE ON "__mj"."Rubric"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_rubric"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubrics
-- Item: spDeleteRubric
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Rubric
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRubric'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRubric"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."Rubric"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubric" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubric" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suite Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_suite_run_suite_id"
    ON "__mj"."TestSuiteRun" ("SuiteID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_suite_run_run_by_user_id"
    ON "__mj"."TestSuiteRun" ("RunByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suite Runs
-- Item: vwTestSuiteRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Suite Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  TestSuiteRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwTestSuiteRuns"
AS
SELECT
    t.*,
    MJTestSuite_SuiteID."Name" AS "Suite",
    MJUser_RunByUserID."Name" AS "RunByUser"
FROM
    "__mj"."TestSuiteRun" AS t
INNER JOIN
    "__mj"."TestSuite" AS MJTestSuite_SuiteID
  ON
    "t"."SuiteID" = MJTestSuite_SuiteID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_RunByUserID
  ON
    "t"."RunByUserID" = MJUser_RunByUserID."ID"
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
        AND tc.relname = 'vwTestSuiteRuns'
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
                           AND tc.relname = 'vwTestSuiteRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwTestSuiteRuns" CASCADE;
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
GRANT SELECT ON "__mj"."vwTestSuiteRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwTestSuiteRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwTestSuiteRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suite Runs
-- Item: spCreateTestSuiteRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR TestSuiteRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTestSuiteRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateTestSuiteRun"(
    p_id UUID DEFAULT NULL,
    p_suiteid UUID DEFAULT NULL,
    p_runbyuserid UUID DEFAULT NULL,
    p_environment_clear boolean DEFAULT false,
    p_environment varchar(50) DEFAULT NULL,
    p_triggertype_clear boolean DEFAULT false,
    p_triggertype varchar(50) DEFAULT NULL,
    p_gitcommit_clear boolean DEFAULT false,
    p_gitcommit varchar(100) DEFAULT NULL,
    p_agentversion_clear boolean DEFAULT false,
    p_agentversion varchar(100) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_totaltests_clear boolean DEFAULT false,
    p_totaltests int DEFAULT NULL,
    p_passedtests_clear boolean DEFAULT false,
    p_passedtests int DEFAULT NULL,
    p_failedtests_clear boolean DEFAULT false,
    p_failedtests int DEFAULT NULL,
    p_skippedtests_clear boolean DEFAULT false,
    p_skippedtests int DEFAULT NULL,
    p_errortests_clear boolean DEFAULT false,
    p_errortests int DEFAULT NULL,
    p_totaldurationseconds_clear boolean DEFAULT false,
    p_totaldurationseconds decimal(10, 3) DEFAULT NULL,
    p_totalcostusd_clear boolean DEFAULT false,
    p_totalcostusd decimal(10, 6) DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_resultsummary_clear boolean DEFAULT false,
    p_resultsummary TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_tags_clear boolean DEFAULT false,
    p_tags TEXT DEFAULT NULL,
    p_machinename_clear boolean DEFAULT false,
    p_machinename varchar(255) DEFAULT NULL,
    p_machineid_clear boolean DEFAULT false,
    p_machineid varchar(255) DEFAULT NULL,
    p_runbyusername_clear boolean DEFAULT false,
    p_runbyusername varchar(255) DEFAULT NULL,
    p_runbyuseremail_clear boolean DEFAULT false,
    p_runbyuseremail varchar(255) DEFAULT NULL,
    p_runcontextdetails_clear boolean DEFAULT false,
    p_runcontextdetails TEXT DEFAULT NULL,
    p_resolvedvariables_clear boolean DEFAULT false,
    p_resolvedvariables TEXT DEFAULT NULL,
    p_score_clear boolean DEFAULT false,
    p_score decimal(9, 6) DEFAULT NULL
) RETURNS SETOF "__mj"."vwTestSuiteRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."TestSuiteRun"
        (
            "ID",
            "SuiteID",
                "RunByUserID",
                "Environment",
                "TriggerType",
                "GitCommit",
                "AgentVersion",
                "Status",
                "StartedAt",
                "CompletedAt",
                "TotalTests",
                "PassedTests",
                "FailedTests",
                "SkippedTests",
                "ErrorTests",
                "TotalDurationSeconds",
                "TotalCostUSD",
                "Configuration",
                "ResultSummary",
                "ErrorMessage",
                "Tags",
                "MachineName",
                "MachineID",
                "RunByUserName",
                "RunByUserEmail",
                "RunContextDetails",
                "ResolvedVariables",
                "Score"
        )
    VALUES
        (
            v_new_id,
            p_suiteid,
                p_runbyuserid,
                CASE WHEN p_environment_clear = true THEN NULL ELSE COALESCE(p_environment, NULL) END,
                CASE WHEN p_triggertype_clear = true THEN NULL ELSE COALESCE(p_triggertype, NULL) END,
                CASE WHEN p_gitcommit_clear = true THEN NULL ELSE COALESCE(p_gitcommit, NULL) END,
                CASE WHEN p_agentversion_clear = true THEN NULL ELSE COALESCE(p_agentversion, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_totaltests_clear = true THEN NULL ELSE COALESCE(p_totaltests, NULL) END,
                CASE WHEN p_passedtests_clear = true THEN NULL ELSE COALESCE(p_passedtests, NULL) END,
                CASE WHEN p_failedtests_clear = true THEN NULL ELSE COALESCE(p_failedtests, NULL) END,
                CASE WHEN p_skippedtests_clear = true THEN NULL ELSE COALESCE(p_skippedtests, NULL) END,
                CASE WHEN p_errortests_clear = true THEN NULL ELSE COALESCE(p_errortests, NULL) END,
                CASE WHEN p_totaldurationseconds_clear = true THEN NULL ELSE COALESCE(p_totaldurationseconds, NULL) END,
                CASE WHEN p_totalcostusd_clear = true THEN NULL ELSE COALESCE(p_totalcostusd, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_resultsummary_clear = true THEN NULL ELSE COALESCE(p_resultsummary, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_tags_clear = true THEN NULL ELSE COALESCE(p_tags, NULL) END,
                CASE WHEN p_machinename_clear = true THEN NULL ELSE COALESCE(p_machinename, NULL) END,
                CASE WHEN p_machineid_clear = true THEN NULL ELSE COALESCE(p_machineid, NULL) END,
                CASE WHEN p_runbyusername_clear = true THEN NULL ELSE COALESCE(p_runbyusername, NULL) END,
                CASE WHEN p_runbyuseremail_clear = true THEN NULL ELSE COALESCE(p_runbyuseremail, NULL) END,
                CASE WHEN p_runcontextdetails_clear = true THEN NULL ELSE COALESCE(p_runcontextdetails, NULL) END,
                CASE WHEN p_resolvedvariables_clear = true THEN NULL ELSE COALESCE(p_resolvedvariables, NULL) END,
                CASE WHEN p_score_clear = true THEN NULL ELSE COALESCE(p_score, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwTestSuiteRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTestSuiteRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTestSuiteRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suite Runs
-- Item: spUpdateTestSuiteRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR TestSuiteRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTestSuiteRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateTestSuiteRun"(
    p_id UUID,
    p_suiteid UUID DEFAULT NULL,
    p_runbyuserid UUID DEFAULT NULL,
    p_environment_clear boolean DEFAULT false,
    p_environment varchar(50) DEFAULT NULL,
    p_triggertype_clear boolean DEFAULT false,
    p_triggertype varchar(50) DEFAULT NULL,
    p_gitcommit_clear boolean DEFAULT false,
    p_gitcommit varchar(100) DEFAULT NULL,
    p_agentversion_clear boolean DEFAULT false,
    p_agentversion varchar(100) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_totaltests_clear boolean DEFAULT false,
    p_totaltests int DEFAULT NULL,
    p_passedtests_clear boolean DEFAULT false,
    p_passedtests int DEFAULT NULL,
    p_failedtests_clear boolean DEFAULT false,
    p_failedtests int DEFAULT NULL,
    p_skippedtests_clear boolean DEFAULT false,
    p_skippedtests int DEFAULT NULL,
    p_errortests_clear boolean DEFAULT false,
    p_errortests int DEFAULT NULL,
    p_totaldurationseconds_clear boolean DEFAULT false,
    p_totaldurationseconds decimal(10, 3) DEFAULT NULL,
    p_totalcostusd_clear boolean DEFAULT false,
    p_totalcostusd decimal(10, 6) DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_resultsummary_clear boolean DEFAULT false,
    p_resultsummary TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_tags_clear boolean DEFAULT false,
    p_tags TEXT DEFAULT NULL,
    p_machinename_clear boolean DEFAULT false,
    p_machinename varchar(255) DEFAULT NULL,
    p_machineid_clear boolean DEFAULT false,
    p_machineid varchar(255) DEFAULT NULL,
    p_runbyusername_clear boolean DEFAULT false,
    p_runbyusername varchar(255) DEFAULT NULL,
    p_runbyuseremail_clear boolean DEFAULT false,
    p_runbyuseremail varchar(255) DEFAULT NULL,
    p_runcontextdetails_clear boolean DEFAULT false,
    p_runcontextdetails TEXT DEFAULT NULL,
    p_resolvedvariables_clear boolean DEFAULT false,
    p_resolvedvariables TEXT DEFAULT NULL,
    p_score_clear boolean DEFAULT false,
    p_score decimal(9, 6) DEFAULT NULL
) RETURNS SETOF "__mj"."vwTestSuiteRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."TestSuiteRun"
    SET
        "SuiteID" = COALESCE(p_suiteid, "SuiteID"),
        "RunByUserID" = COALESCE(p_runbyuserid, "RunByUserID"),
        "Environment" = CASE WHEN p_environment_clear = true THEN NULL ELSE COALESCE(p_environment, "Environment") END,
        "TriggerType" = CASE WHEN p_triggertype_clear = true THEN NULL ELSE COALESCE(p_triggertype, "TriggerType") END,
        "GitCommit" = CASE WHEN p_gitcommit_clear = true THEN NULL ELSE COALESCE(p_gitcommit, "GitCommit") END,
        "AgentVersion" = CASE WHEN p_agentversion_clear = true THEN NULL ELSE COALESCE(p_agentversion, "AgentVersion") END,
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "TotalTests" = CASE WHEN p_totaltests_clear = true THEN NULL ELSE COALESCE(p_totaltests, "TotalTests") END,
        "PassedTests" = CASE WHEN p_passedtests_clear = true THEN NULL ELSE COALESCE(p_passedtests, "PassedTests") END,
        "FailedTests" = CASE WHEN p_failedtests_clear = true THEN NULL ELSE COALESCE(p_failedtests, "FailedTests") END,
        "SkippedTests" = CASE WHEN p_skippedtests_clear = true THEN NULL ELSE COALESCE(p_skippedtests, "SkippedTests") END,
        "ErrorTests" = CASE WHEN p_errortests_clear = true THEN NULL ELSE COALESCE(p_errortests, "ErrorTests") END,
        "TotalDurationSeconds" = CASE WHEN p_totaldurationseconds_clear = true THEN NULL ELSE COALESCE(p_totaldurationseconds, "TotalDurationSeconds") END,
        "TotalCostUSD" = CASE WHEN p_totalcostusd_clear = true THEN NULL ELSE COALESCE(p_totalcostusd, "TotalCostUSD") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "ResultSummary" = CASE WHEN p_resultsummary_clear = true THEN NULL ELSE COALESCE(p_resultsummary, "ResultSummary") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "Tags" = CASE WHEN p_tags_clear = true THEN NULL ELSE COALESCE(p_tags, "Tags") END,
        "MachineName" = CASE WHEN p_machinename_clear = true THEN NULL ELSE COALESCE(p_machinename, "MachineName") END,
        "MachineID" = CASE WHEN p_machineid_clear = true THEN NULL ELSE COALESCE(p_machineid, "MachineID") END,
        "RunByUserName" = CASE WHEN p_runbyusername_clear = true THEN NULL ELSE COALESCE(p_runbyusername, "RunByUserName") END,
        "RunByUserEmail" = CASE WHEN p_runbyuseremail_clear = true THEN NULL ELSE COALESCE(p_runbyuseremail, "RunByUserEmail") END,
        "RunContextDetails" = CASE WHEN p_runcontextdetails_clear = true THEN NULL ELSE COALESCE(p_runcontextdetails, "RunContextDetails") END,
        "ResolvedVariables" = CASE WHEN p_resolvedvariables_clear = true THEN NULL ELSE COALESCE(p_resolvedvariables, "ResolvedVariables") END,
        "Score" = CASE WHEN p_score_clear = true THEN NULL ELSE COALESCE(p_score, "Score") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwTestSuiteRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTestSuiteRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTestSuiteRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestSuiteRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_test_suite_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_test_suite_run" ON "__mj"."TestSuiteRun";

CREATE TRIGGER "trg_update_test_suite_run"
BEFORE UPDATE ON "__mj"."TestSuiteRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_test_suite_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suite Runs
-- Item: spDeleteTestSuiteRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR TestSuiteRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteTestSuiteRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteTestSuiteRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."TestSuiteRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTestSuiteRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTestSuiteRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suites
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_suite_parent_id"
    ON "__mj"."TestSuite" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_suite_rubric_id"
    ON "__mj"."TestSuite" ("RubricID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suites
-- Item: fn_test_suite_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: TestSuite.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_test_suite_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."TestSuite"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."TestSuite" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."TestSuite" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."TestSuite" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suites
-- Item: fn_test_suite_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: TestSuite.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_test_suite_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."TestSuite"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."TestSuite" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."TestSuite" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."TestSuite" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suites
-- Item: fn_test_suite_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: TestSuite.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_test_suite_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."TestSuite"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."TestSuite" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suites
-- Item: fn_test_suite_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: TestSuite.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_test_suite_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."TestSuite"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."TestSuite" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suites
-- Item: vwTestSuites
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Suites
-----               SCHEMA:      __mj
-----               BASE TABLE:  TestSuite
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwTestSuites"
AS
SELECT
    t.*,
    MJTestSuite_ParentID."Name" AS "Parent",
    MJRubric_RubricID."Name" AS "Rubric",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."TestSuite" AS t
LEFT OUTER JOIN
    "__mj"."TestSuite" AS MJTestSuite_ParentID
  ON
    "t"."ParentID" = MJTestSuite_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."Rubric" AS MJRubric_RubricID
  ON
    "t"."RubricID" = MJRubric_RubricID."ID"

LEFT JOIN LATERAL "__mj"."fn_test_suite_parent_id_get_hierarchy_meta"(t."ID", t."ParentID") AS hier_ParentID ON true
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
        AND tc.relname = 'vwTestSuites'
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
                           AND tc.relname = 'vwTestSuites'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwTestSuites" CASCADE;
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
GRANT SELECT ON "__mj"."vwTestSuites" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwTestSuites" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwTestSuites" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suites
-- Item: spCreateTestSuite
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR TestSuite
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTestSuite'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateTestSuite"(
    p_id UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_tags_clear boolean DEFAULT false,
    p_tags TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_maxexecutiontimems_clear boolean DEFAULT false,
    p_maxexecutiontimems int DEFAULT NULL,
    p_variables_clear boolean DEFAULT false,
    p_variables TEXT DEFAULT NULL,
    p_rubricid_clear boolean DEFAULT false,
    p_rubricid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwTestSuites" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."TestSuite"
        (
            "ID",
            "ParentID",
                "Name",
                "Description",
                "Status",
                "Tags",
                "Configuration",
                "MaxExecutionTimeMS",
                "Variables",
                "RubricID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_tags_clear = true THEN NULL ELSE COALESCE(p_tags, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_maxexecutiontimems_clear = true THEN NULL ELSE COALESCE(p_maxexecutiontimems, NULL) END,
                CASE WHEN p_variables_clear = true THEN NULL ELSE COALESCE(p_variables, NULL) END,
                CASE WHEN p_rubricid_clear = true THEN NULL ELSE COALESCE(p_rubricid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwTestSuites"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTestSuite" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTestSuite" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suites
-- Item: spUpdateTestSuite
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR TestSuite
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTestSuite'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateTestSuite"(
    p_id UUID,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_tags_clear boolean DEFAULT false,
    p_tags TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_maxexecutiontimems_clear boolean DEFAULT false,
    p_maxexecutiontimems int DEFAULT NULL,
    p_variables_clear boolean DEFAULT false,
    p_variables TEXT DEFAULT NULL,
    p_rubricid_clear boolean DEFAULT false,
    p_rubricid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwTestSuites" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."TestSuite"
    SET
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Status" = COALESCE(p_status, "Status"),
        "Tags" = CASE WHEN p_tags_clear = true THEN NULL ELSE COALESCE(p_tags, "Tags") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "MaxExecutionTimeMS" = CASE WHEN p_maxexecutiontimems_clear = true THEN NULL ELSE COALESCE(p_maxexecutiontimems, "MaxExecutionTimeMS") END,
        "Variables" = CASE WHEN p_variables_clear = true THEN NULL ELSE COALESCE(p_variables, "Variables") END,
        "RubricID" = CASE WHEN p_rubricid_clear = true THEN NULL ELSE COALESCE(p_rubricid, "RubricID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwTestSuites"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTestSuite" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTestSuite" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestSuite table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_test_suite"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_test_suite" ON "__mj"."TestSuite";

CREATE TRIGGER "trg_update_test_suite"
BEFORE UPDATE ON "__mj"."TestSuite"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_test_suite"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Suites
-- Item: spDeleteTestSuite
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR TestSuite
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteTestSuite'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteTestSuite"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."TestSuite"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTestSuite" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTestSuite" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tests
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_type_id"
    ON "__mj"."Test" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_rubric_id"
    ON "__mj"."Test" ("RubricID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tests
-- Item: vwTests
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tests
-----               SCHEMA:      __mj
-----               BASE TABLE:  Test
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwTests"
AS
SELECT
    t.*,
    MJTestType_TypeID."Name" AS "Type",
    MJRubric_RubricID."Name" AS "Rubric"
FROM
    "__mj"."Test" AS t
INNER JOIN
    "__mj"."TestType" AS MJTestType_TypeID
  ON
    "t"."TypeID" = MJTestType_TypeID."ID"
LEFT OUTER JOIN
    "__mj"."Rubric" AS MJRubric_RubricID
  ON
    "t"."RubricID" = MJRubric_RubricID."ID"
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
        AND tc.relname = 'vwTests'
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
                           AND tc.relname = 'vwTests'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwTests" CASCADE;
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
GRANT SELECT ON "__mj"."vwTests" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwTests" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwTests" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tests
-- Item: spCreateTest
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Test
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTest'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateTest"(
    p_id UUID DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_inputdefinition_clear boolean DEFAULT false,
    p_inputdefinition TEXT DEFAULT NULL,
    p_expectedoutcomes_clear boolean DEFAULT false,
    p_expectedoutcomes TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_tags_clear boolean DEFAULT false,
    p_tags TEXT DEFAULT NULL,
    p_priority_clear boolean DEFAULT false,
    p_priority int DEFAULT NULL,
    p_estimateddurationseconds_clear boolean DEFAULT false,
    p_estimateddurationseconds int DEFAULT NULL,
    p_estimatedcostusd_clear boolean DEFAULT false,
    p_estimatedcostusd decimal(10, 6) DEFAULT NULL,
    p_repeatcount_clear boolean DEFAULT false,
    p_repeatcount int DEFAULT NULL,
    p_maxexecutiontimems_clear boolean DEFAULT false,
    p_maxexecutiontimems int DEFAULT NULL,
    p_variables_clear boolean DEFAULT false,
    p_variables TEXT DEFAULT NULL,
    p_rubricid_clear boolean DEFAULT false,
    p_rubricid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwTests" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Test"
        (
            "ID",
            "TypeID",
                "Name",
                "Description",
                "Status",
                "InputDefinition",
                "ExpectedOutcomes",
                "Configuration",
                "Tags",
                "Priority",
                "EstimatedDurationSeconds",
                "EstimatedCostUSD",
                "RepeatCount",
                "MaxExecutionTimeMS",
                "Variables",
                "RubricID"
        )
    VALUES
        (
            v_new_id,
            p_typeid,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_inputdefinition_clear = true THEN NULL ELSE COALESCE(p_inputdefinition, NULL) END,
                CASE WHEN p_expectedoutcomes_clear = true THEN NULL ELSE COALESCE(p_expectedoutcomes, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_tags_clear = true THEN NULL ELSE COALESCE(p_tags, NULL) END,
                CASE WHEN p_priority_clear = true THEN NULL ELSE COALESCE(p_priority, 0) END,
                CASE WHEN p_estimateddurationseconds_clear = true THEN NULL ELSE COALESCE(p_estimateddurationseconds, NULL) END,
                CASE WHEN p_estimatedcostusd_clear = true THEN NULL ELSE COALESCE(p_estimatedcostusd, NULL) END,
                CASE WHEN p_repeatcount_clear = true THEN NULL ELSE COALESCE(p_repeatcount, NULL) END,
                CASE WHEN p_maxexecutiontimems_clear = true THEN NULL ELSE COALESCE(p_maxexecutiontimems, NULL) END,
                CASE WHEN p_variables_clear = true THEN NULL ELSE COALESCE(p_variables, NULL) END,
                CASE WHEN p_rubricid_clear = true THEN NULL ELSE COALESCE(p_rubricid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwTests"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTest" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tests
-- Item: spUpdateTest
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Test
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTest'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateTest"(
    p_id UUID,
    p_typeid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_inputdefinition_clear boolean DEFAULT false,
    p_inputdefinition TEXT DEFAULT NULL,
    p_expectedoutcomes_clear boolean DEFAULT false,
    p_expectedoutcomes TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_tags_clear boolean DEFAULT false,
    p_tags TEXT DEFAULT NULL,
    p_priority_clear boolean DEFAULT false,
    p_priority int DEFAULT NULL,
    p_estimateddurationseconds_clear boolean DEFAULT false,
    p_estimateddurationseconds int DEFAULT NULL,
    p_estimatedcostusd_clear boolean DEFAULT false,
    p_estimatedcostusd decimal(10, 6) DEFAULT NULL,
    p_repeatcount_clear boolean DEFAULT false,
    p_repeatcount int DEFAULT NULL,
    p_maxexecutiontimems_clear boolean DEFAULT false,
    p_maxexecutiontimems int DEFAULT NULL,
    p_variables_clear boolean DEFAULT false,
    p_variables TEXT DEFAULT NULL,
    p_rubricid_clear boolean DEFAULT false,
    p_rubricid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwTests" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Test"
    SET
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Status" = COALESCE(p_status, "Status"),
        "InputDefinition" = CASE WHEN p_inputdefinition_clear = true THEN NULL ELSE COALESCE(p_inputdefinition, "InputDefinition") END,
        "ExpectedOutcomes" = CASE WHEN p_expectedoutcomes_clear = true THEN NULL ELSE COALESCE(p_expectedoutcomes, "ExpectedOutcomes") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "Tags" = CASE WHEN p_tags_clear = true THEN NULL ELSE COALESCE(p_tags, "Tags") END,
        "Priority" = CASE WHEN p_priority_clear = true THEN NULL ELSE COALESCE(p_priority, "Priority") END,
        "EstimatedDurationSeconds" = CASE WHEN p_estimateddurationseconds_clear = true THEN NULL ELSE COALESCE(p_estimateddurationseconds, "EstimatedDurationSeconds") END,
        "EstimatedCostUSD" = CASE WHEN p_estimatedcostusd_clear = true THEN NULL ELSE COALESCE(p_estimatedcostusd, "EstimatedCostUSD") END,
        "RepeatCount" = CASE WHEN p_repeatcount_clear = true THEN NULL ELSE COALESCE(p_repeatcount, "RepeatCount") END,
        "MaxExecutionTimeMS" = CASE WHEN p_maxexecutiontimems_clear = true THEN NULL ELSE COALESCE(p_maxexecutiontimems, "MaxExecutionTimeMS") END,
        "Variables" = CASE WHEN p_variables_clear = true THEN NULL ELSE COALESCE(p_variables, "Variables") END,
        "RubricID" = CASE WHEN p_rubricid_clear = true THEN NULL ELSE COALESCE(p_rubricid, "RubricID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwTests"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTest" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Test table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_test"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_test" ON "__mj"."Test";

CREATE TRIGGER "trg_update_test"
BEFORE UPDATE ON "__mj"."Test"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_test"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tests
-- Item: spDeleteTest
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Test
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteTest'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteTest"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."Test"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTest" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_id"
    ON "__mj"."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_parent_run_id"
    ON "__mj"."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_id"
    ON "__mj"."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_user_id"
    ON "__mj"."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_detail_id"
    ON "__mj"."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_last_run_id"
    ON "__mj"."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_configuration_id"
    ON "__mj"."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_model_id"
    ON "__mj"."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_vendor_id"
    ON "__mj"."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_scheduled_job_run_id"
    ON "__mj"."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_test_run_id"
    ON "__mj"."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_primary_scope_entity_id"
    ON "__mj"."AIAgentRun" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_session_id"
    ON "__mj"."AIAgentRun" ("AgentSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentRunID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentRunID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentRunID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentRunID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentRunID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentRunID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun" c
        INNER JOIN
            cte_descendants p ON c."ParentRunID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentRunID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentRunID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentRunID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_root_id"(
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
            "__mj"."AIAgentRun"
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
            "__mj"."AIAgentRun" c
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentRuns"
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
    hier_ParentRunID."RootID" AS "RootParentRunID",
    hier_ParentRunID."Depth" AS "ParentRunIDDepth",
    hier_ParentRunID."Path" AS "ParentRunIDPath",
    hier_ParentRunID."IsLeaf" AS "ParentRunIDIsLeaf",
    hier_ParentRunID."ChildCount" AS "ParentRunIDChildCount"
FROM
    "__mj"."AIAgentRun" AS a
INNER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_ParentRunID
  ON
    "a"."ParentRunID" = MJAIAgentRun_ParentRunID."ID"
LEFT OUTER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "a"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_LastRunID
  ON
    "a"."LastRunID" = MJAIAgentRun_LastRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_OverrideModelID
  ON
    "a"."OverrideModelID" = MJAIModel_OverrideModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIVendor" AS MJAIVendor_OverrideVendorID
  ON
    "a"."OverrideVendorID" = MJAIVendor_OverrideVendorID."ID"
LEFT OUTER JOIN
    "__mj"."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "a"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_agent_run_parent_run_id_get_hierarchy_meta"(a."ID", a."ParentRunID") AS hier_ParentRunID ON true
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
        AND tc.relname = 'vwAIAgentRuns'
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
                           AND tc.relname = 'vwAIAgentRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentRuns" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgentRuns"
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
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'LastHeartbeatAt', 'AgentSessionID', 'PlanMode', 'ExternalSessionID', 'ContinuationDepth']
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
        WHEN 'PlanMode' THEN 'COALESCE(($1->>''PlanMode'')::BOOLEAN, FALSE)'
        WHEN 'ExternalSessionID' THEN '($1->>''ExternalSessionID'')'
        WHEN 'ContinuationDepth' THEN 'COALESCE(($1->>''ContinuationDepth'')::INTEGER, 0)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIAgentRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgentRun: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIAgentRun"
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
        "PlanMode" = CASE WHEN p_data ? 'PlanMode' THEN (p_data->>'PlanMode')::BOOLEAN ELSE "PlanMode" END,
        "ExternalSessionID" = CASE WHEN p_data ? 'ExternalSessionID' THEN (p_data->>'ExternalSessionID') ELSE "ExternalSessionID" END,
        "ContinuationDepth" = CASE WHEN p_data ? 'ContinuationDepth' THEN (p_data->>'ContinuationDepth')::INTEGER ELSE "ContinuationDepth" END,
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
    SELECT * FROM "__mj"."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run" ON "__mj"."AIAgentRun";

CREATE TRIGGER "trg_update_ai_agent_run"
BEFORE UPDATE ON "__mj"."AIAgentRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_run"();



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

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentRun"(
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
        FROM "__mj"."AIAgentExample"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentExample"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentNote"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentNote"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "OriginatingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "OriginatingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.ResumingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "ResumingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "ResumingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Medias records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunMedia"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Steps records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRunStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ParentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "ParentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "ParentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.LastRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "LastRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "LastRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Skills.ActivatedByRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationSkill"
        WHERE "ActivatedByRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ConversationSkill"
        SET "ActivatedByRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DuplicateRunDetailMatch"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DuplicateRunDetailMatch"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Session Iterations.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ExperimentSessionIteration"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ExperimentSessionIteration"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Sessions.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ExperimentSession"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ExperimentSession"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Process Run Details.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ProcessRunDetail"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ProcessRunDetail"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Rubric Evaluations.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RubricEvaluation"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RubricEvaluation"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutineRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutineRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIAgentRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_usage_type_id"
    ON "__mj"."AIPromptRun" ("UsageTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_prompt_id"
    ON "__mj"."AIPromptRun" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_model_id"
    ON "__mj"."AIPromptRun" ("ModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_vendor_id"
    ON "__mj"."AIPromptRun" ("VendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_agent_id"
    ON "__mj"."AIPromptRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_configuration_id"
    ON "__mj"."AIPromptRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_parent_id"
    ON "__mj"."AIPromptRun" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_original_model_id"
    ON "__mj"."AIPromptRun" ("OriginalModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_rerun_from_prompt_run_id"
    ON "__mj"."AIPromptRun" ("RerunFromPromptRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_judge_id"
    ON "__mj"."AIPromptRun" ("JudgeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_child_prompt_id"
    ON "__mj"."AIPromptRun" ("ChildPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_test_run_id"
    ON "__mj"."AIPromptRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_user_id"
    ON "__mj"."AIPromptRun" ("UserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIPromptRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIPromptRun" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIPromptRun" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIPromptRun" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIPromptRun" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIPromptRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."AIPromptRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIPromptRuns"
AS
SELECT
    a.*,
    MJAIUsageType_UsageTypeID."Name" AS "UsageType",
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJAIModel_ModelID."Name" AS "Model",
    MJAIVendor_VendorID."Name" AS "Vendor",
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIPromptRun_ParentID."RunName" AS "Parent",
    MJAIModel_OriginalModelID."Name" AS "OriginalModel",
    MJAIPromptRun_RerunFromPromptRunID."RunName" AS "RerunFromPromptRun",
    MJAIPrompt_JudgeID."Name" AS "Judge",
    MJAIPrompt_ChildPromptID."Name" AS "ChildPrompt",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJUser_UserID."Name" AS "User",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."AIPromptRun" AS a
LEFT OUTER JOIN
    "__mj"."AIUsageType" AS MJAIUsageType_UsageTypeID
  ON
    "a"."UsageTypeID" = MJAIUsageType_UsageTypeID."ID"
INNER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "a"."PromptID" = MJAIPrompt_PromptID."ID"
INNER JOIN
    "__mj"."AIModel" AS MJAIModel_ModelID
  ON
    "a"."ModelID" = MJAIModel_ModelID."ID"
INNER JOIN
    "__mj"."AIVendor" AS MJAIVendor_VendorID
  ON
    "a"."VendorID" = MJAIVendor_VendorID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptRun" AS MJAIPromptRun_ParentID
  ON
    "a"."ParentID" = MJAIPromptRun_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_OriginalModelID
  ON
    "a"."OriginalModelID" = MJAIModel_OriginalModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptRun" AS MJAIPromptRun_RerunFromPromptRunID
  ON
    "a"."RerunFromPromptRunID" = MJAIPromptRun_RerunFromPromptRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_JudgeID
  ON
    "a"."JudgeID" = MJAIPrompt_JudgeID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ChildPromptID
  ON
    "a"."ChildPromptID" = MJAIPrompt_ChildPromptID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_prompt_run_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
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
        AND tc.relname = 'vwAIPromptRuns'
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
                           AND tc.relname = 'vwAIPromptRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIPromptRuns" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIPromptRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIPromptRuns"
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
    FOREACH v_field_name IN ARRAY ARRAY['InputUnitsUsed', 'OutputUnitsUsed', 'UsageTypeID', 'PromptID', 'ModelID', 'VendorID', 'AgentID', 'ConfigurationID', 'RunAt', 'CompletedAt', 'ExecutionTimeMS', 'Messages', 'Result', 'TokensUsed', 'TokensPrompt', 'TokensCompletion', 'TotalCost', 'Success', 'ErrorMessage', 'ParentID', 'RunType', 'ExecutionOrder', 'Cost', 'CostCurrency', 'TokensUsedRollup', 'TokensPromptRollup', 'TokensCompletionRollup', 'Temperature', 'TopP', 'TopK', 'MinP', 'FrequencyPenalty', 'PresencePenalty', 'Seed', 'StopSequences', 'ResponseFormat', 'LogProbs', 'TopLogProbs', 'DescendantCost', 'ValidationAttemptCount', 'SuccessfulValidationCount', 'FinalValidationPassed', 'ValidationBehavior', 'RetryStrategy', 'MaxRetriesConfigured', 'FinalValidationError', 'ValidationErrorCount', 'CommonValidationError', 'FirstAttemptAt', 'LastAttemptAt', 'TotalRetryDurationMS', 'ValidationAttempts', 'ValidationSummary', 'FailoverAttempts', 'FailoverErrors', 'FailoverDurations', 'OriginalModelID', 'OriginalRequestStartTime', 'TotalFailoverDuration', 'RerunFromPromptRunID', 'ModelSelection', 'Status', 'Cancelled', 'CancellationReason', 'ModelPowerRank', 'SelectionStrategy', 'CacheHit', 'CacheKey', 'JudgeID', 'JudgeScore', 'WasSelectedResult', 'StreamingEnabled', 'FirstTokenTime', 'ErrorDetails', 'ChildPromptID', 'QueueTime', 'PromptTime', 'CompletionTime', 'ModelSpecificResponseDetails', 'EffortLevel', 'RunName', 'Comments', 'TestRunID', 'AssistantPrefill', 'TokensCacheRead', 'TokensCacheWrite', 'TokensCacheReadRollup', 'TokensCacheWriteRollup', 'ToolCallingMode', 'UserID']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'InputUnitsUsed' THEN '($1->>''InputUnitsUsed'')::DECIMAL(19, 8)'
        WHEN 'OutputUnitsUsed' THEN '($1->>''OutputUnitsUsed'')::DECIMAL(19, 8)'
        WHEN 'UsageTypeID' THEN '($1->>''UsageTypeID'')::UUID'
        WHEN 'PromptID' THEN '($1->>''PromptID'')::UUID'
        WHEN 'ModelID' THEN '($1->>''ModelID'')::UUID'
        WHEN 'VendorID' THEN '($1->>''VendorID'')::UUID'
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'RunAt' THEN 'COALESCE(($1->>''RunAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'ExecutionTimeMS' THEN '($1->>''ExecutionTimeMS'')::INT'
        WHEN 'Messages' THEN '($1->>''Messages'')'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'TokensUsed' THEN '($1->>''TokensUsed'')::INT'
        WHEN 'TokensPrompt' THEN '($1->>''TokensPrompt'')::INT'
        WHEN 'TokensCompletion' THEN '($1->>''TokensCompletion'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'Success' THEN 'COALESCE(($1->>''Success'')::BOOLEAN, FALSE)'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'RunType' THEN 'COALESCE(($1->>''RunType''), ''Single'')'
        WHEN 'ExecutionOrder' THEN '($1->>''ExecutionOrder'')::INT'
        WHEN 'Cost' THEN '($1->>''Cost'')::DECIMAL(19, 8)'
        WHEN 'CostCurrency' THEN '($1->>''CostCurrency'')'
        WHEN 'TokensUsedRollup' THEN '($1->>''TokensUsedRollup'')::INT'
        WHEN 'TokensPromptRollup' THEN '($1->>''TokensPromptRollup'')::INT'
        WHEN 'TokensCompletionRollup' THEN '($1->>''TokensCompletionRollup'')::INT'
        WHEN 'Temperature' THEN '($1->>''Temperature'')::DECIMAL(3, 2)'
        WHEN 'TopP' THEN '($1->>''TopP'')::DECIMAL(3, 2)'
        WHEN 'TopK' THEN '($1->>''TopK'')::INT'
        WHEN 'MinP' THEN '($1->>''MinP'')::DECIMAL(3, 2)'
        WHEN 'FrequencyPenalty' THEN '($1->>''FrequencyPenalty'')::DECIMAL(3, 2)'
        WHEN 'PresencePenalty' THEN '($1->>''PresencePenalty'')::DECIMAL(3, 2)'
        WHEN 'Seed' THEN '($1->>''Seed'')::INT'
        WHEN 'StopSequences' THEN '($1->>''StopSequences'')'
        WHEN 'ResponseFormat' THEN '($1->>''ResponseFormat'')'
        WHEN 'LogProbs' THEN '($1->>''LogProbs'')::BOOLEAN'
        WHEN 'TopLogProbs' THEN '($1->>''TopLogProbs'')::INT'
        WHEN 'DescendantCost' THEN '($1->>''DescendantCost'')::DECIMAL(18, 6)'
        WHEN 'ValidationAttemptCount' THEN '($1->>''ValidationAttemptCount'')::INT'
        WHEN 'SuccessfulValidationCount' THEN '($1->>''SuccessfulValidationCount'')::INT'
        WHEN 'FinalValidationPassed' THEN '($1->>''FinalValidationPassed'')::BOOLEAN'
        WHEN 'ValidationBehavior' THEN '($1->>''ValidationBehavior'')'
        WHEN 'RetryStrategy' THEN '($1->>''RetryStrategy'')'
        WHEN 'MaxRetriesConfigured' THEN '($1->>''MaxRetriesConfigured'')::INT'
        WHEN 'FinalValidationError' THEN '($1->>''FinalValidationError'')'
        WHEN 'ValidationErrorCount' THEN '($1->>''ValidationErrorCount'')::INT'
        WHEN 'CommonValidationError' THEN '($1->>''CommonValidationError'')'
        WHEN 'FirstAttemptAt' THEN '($1->>''FirstAttemptAt'')::TIMESTAMPTZ'
        WHEN 'LastAttemptAt' THEN '($1->>''LastAttemptAt'')::TIMESTAMPTZ'
        WHEN 'TotalRetryDurationMS' THEN '($1->>''TotalRetryDurationMS'')::INT'
        WHEN 'ValidationAttempts' THEN '($1->>''ValidationAttempts'')'
        WHEN 'ValidationSummary' THEN '($1->>''ValidationSummary'')'
        WHEN 'FailoverAttempts' THEN '($1->>''FailoverAttempts'')::INT'
        WHEN 'FailoverErrors' THEN '($1->>''FailoverErrors'')'
        WHEN 'FailoverDurations' THEN '($1->>''FailoverDurations'')'
        WHEN 'OriginalModelID' THEN '($1->>''OriginalModelID'')::UUID'
        WHEN 'OriginalRequestStartTime' THEN '($1->>''OriginalRequestStartTime'')::TIMESTAMPTZ'
        WHEN 'TotalFailoverDuration' THEN '($1->>''TotalFailoverDuration'')::INT'
        WHEN 'RerunFromPromptRunID' THEN '($1->>''RerunFromPromptRunID'')::UUID'
        WHEN 'ModelSelection' THEN '($1->>''ModelSelection'')'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'Cancelled' THEN 'COALESCE(($1->>''Cancelled'')::BOOLEAN, FALSE)'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'ModelPowerRank' THEN '($1->>''ModelPowerRank'')::INT'
        WHEN 'SelectionStrategy' THEN '($1->>''SelectionStrategy'')'
        WHEN 'CacheHit' THEN 'COALESCE(($1->>''CacheHit'')::BOOLEAN, FALSE)'
        WHEN 'CacheKey' THEN '($1->>''CacheKey'')'
        WHEN 'JudgeID' THEN '($1->>''JudgeID'')::UUID'
        WHEN 'JudgeScore' THEN '($1->>''JudgeScore'')::FLOAT(53)'
        WHEN 'WasSelectedResult' THEN 'COALESCE(($1->>''WasSelectedResult'')::BOOLEAN, FALSE)'
        WHEN 'StreamingEnabled' THEN 'COALESCE(($1->>''StreamingEnabled'')::BOOLEAN, FALSE)'
        WHEN 'FirstTokenTime' THEN '($1->>''FirstTokenTime'')::INT'
        WHEN 'ErrorDetails' THEN '($1->>''ErrorDetails'')'
        WHEN 'ChildPromptID' THEN '($1->>''ChildPromptID'')::UUID'
        WHEN 'QueueTime' THEN '($1->>''QueueTime'')::INT'
        WHEN 'PromptTime' THEN '($1->>''PromptTime'')::INT'
        WHEN 'CompletionTime' THEN '($1->>''CompletionTime'')::INT'
        WHEN 'ModelSpecificResponseDetails' THEN '($1->>''ModelSpecificResponseDetails'')'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'AssistantPrefill' THEN '($1->>''AssistantPrefill'')'
        WHEN 'TokensCacheRead' THEN '($1->>''TokensCacheRead'')::INT'
        WHEN 'TokensCacheWrite' THEN '($1->>''TokensCacheWrite'')::INT'
        WHEN 'TokensCacheReadRollup' THEN '($1->>''TokensCacheReadRollup'')::INT'
        WHEN 'TokensCacheWriteRollup' THEN '($1->>''TokensCacheWriteRollup'')::INT'
        WHEN 'ToolCallingMode' THEN '($1->>''ToolCallingMode'')'
        WHEN 'UserID' THEN '($1->>''UserID'')::UUID'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIPromptRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPromptRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIPromptRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIPromptRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIPromptRun: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIPromptRun"
    SET
        "InputUnitsUsed" = CASE WHEN p_data ? 'InputUnitsUsed' THEN (p_data->>'InputUnitsUsed')::DECIMAL(19, 8) ELSE "InputUnitsUsed" END,
        "OutputUnitsUsed" = CASE WHEN p_data ? 'OutputUnitsUsed' THEN (p_data->>'OutputUnitsUsed')::DECIMAL(19, 8) ELSE "OutputUnitsUsed" END,
        "UsageTypeID" = CASE WHEN p_data ? 'UsageTypeID' THEN (p_data->>'UsageTypeID')::UUID ELSE "UsageTypeID" END,
        "PromptID" = CASE WHEN p_data ? 'PromptID' THEN (p_data->>'PromptID')::UUID ELSE "PromptID" END,
        "ModelID" = CASE WHEN p_data ? 'ModelID' THEN (p_data->>'ModelID')::UUID ELSE "ModelID" END,
        "VendorID" = CASE WHEN p_data ? 'VendorID' THEN (p_data->>'VendorID')::UUID ELSE "VendorID" END,
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "RunAt" = CASE WHEN p_data ? 'RunAt' THEN (p_data->>'RunAt')::TIMESTAMPTZ ELSE "RunAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "ExecutionTimeMS" = CASE WHEN p_data ? 'ExecutionTimeMS' THEN (p_data->>'ExecutionTimeMS')::INT ELSE "ExecutionTimeMS" END,
        "Messages" = CASE WHEN p_data ? 'Messages' THEN (p_data->>'Messages') ELSE "Messages" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "TokensUsed" = CASE WHEN p_data ? 'TokensUsed' THEN (p_data->>'TokensUsed')::INT ELSE "TokensUsed" END,
        "TokensPrompt" = CASE WHEN p_data ? 'TokensPrompt' THEN (p_data->>'TokensPrompt')::INT ELSE "TokensPrompt" END,
        "TokensCompletion" = CASE WHEN p_data ? 'TokensCompletion' THEN (p_data->>'TokensCompletion')::INT ELSE "TokensCompletion" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "RunType" = CASE WHEN p_data ? 'RunType' THEN (p_data->>'RunType') ELSE "RunType" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INT ELSE "ExecutionOrder" END,
        "Cost" = CASE WHEN p_data ? 'Cost' THEN (p_data->>'Cost')::DECIMAL(19, 8) ELSE "Cost" END,
        "CostCurrency" = CASE WHEN p_data ? 'CostCurrency' THEN (p_data->>'CostCurrency') ELSE "CostCurrency" END,
        "TokensUsedRollup" = CASE WHEN p_data ? 'TokensUsedRollup' THEN (p_data->>'TokensUsedRollup')::INT ELSE "TokensUsedRollup" END,
        "TokensPromptRollup" = CASE WHEN p_data ? 'TokensPromptRollup' THEN (p_data->>'TokensPromptRollup')::INT ELSE "TokensPromptRollup" END,
        "TokensCompletionRollup" = CASE WHEN p_data ? 'TokensCompletionRollup' THEN (p_data->>'TokensCompletionRollup')::INT ELSE "TokensCompletionRollup" END,
        "Temperature" = CASE WHEN p_data ? 'Temperature' THEN (p_data->>'Temperature')::DECIMAL(3, 2) ELSE "Temperature" END,
        "TopP" = CASE WHEN p_data ? 'TopP' THEN (p_data->>'TopP')::DECIMAL(3, 2) ELSE "TopP" END,
        "TopK" = CASE WHEN p_data ? 'TopK' THEN (p_data->>'TopK')::INT ELSE "TopK" END,
        "MinP" = CASE WHEN p_data ? 'MinP' THEN (p_data->>'MinP')::DECIMAL(3, 2) ELSE "MinP" END,
        "FrequencyPenalty" = CASE WHEN p_data ? 'FrequencyPenalty' THEN (p_data->>'FrequencyPenalty')::DECIMAL(3, 2) ELSE "FrequencyPenalty" END,
        "PresencePenalty" = CASE WHEN p_data ? 'PresencePenalty' THEN (p_data->>'PresencePenalty')::DECIMAL(3, 2) ELSE "PresencePenalty" END,
        "Seed" = CASE WHEN p_data ? 'Seed' THEN (p_data->>'Seed')::INT ELSE "Seed" END,
        "StopSequences" = CASE WHEN p_data ? 'StopSequences' THEN (p_data->>'StopSequences') ELSE "StopSequences" END,
        "ResponseFormat" = CASE WHEN p_data ? 'ResponseFormat' THEN (p_data->>'ResponseFormat') ELSE "ResponseFormat" END,
        "LogProbs" = CASE WHEN p_data ? 'LogProbs' THEN (p_data->>'LogProbs')::BOOLEAN ELSE "LogProbs" END,
        "TopLogProbs" = CASE WHEN p_data ? 'TopLogProbs' THEN (p_data->>'TopLogProbs')::INT ELSE "TopLogProbs" END,
        "DescendantCost" = CASE WHEN p_data ? 'DescendantCost' THEN (p_data->>'DescendantCost')::DECIMAL(18, 6) ELSE "DescendantCost" END,
        "ValidationAttemptCount" = CASE WHEN p_data ? 'ValidationAttemptCount' THEN (p_data->>'ValidationAttemptCount')::INT ELSE "ValidationAttemptCount" END,
        "SuccessfulValidationCount" = CASE WHEN p_data ? 'SuccessfulValidationCount' THEN (p_data->>'SuccessfulValidationCount')::INT ELSE "SuccessfulValidationCount" END,
        "FinalValidationPassed" = CASE WHEN p_data ? 'FinalValidationPassed' THEN (p_data->>'FinalValidationPassed')::BOOLEAN ELSE "FinalValidationPassed" END,
        "ValidationBehavior" = CASE WHEN p_data ? 'ValidationBehavior' THEN (p_data->>'ValidationBehavior') ELSE "ValidationBehavior" END,
        "RetryStrategy" = CASE WHEN p_data ? 'RetryStrategy' THEN (p_data->>'RetryStrategy') ELSE "RetryStrategy" END,
        "MaxRetriesConfigured" = CASE WHEN p_data ? 'MaxRetriesConfigured' THEN (p_data->>'MaxRetriesConfigured')::INT ELSE "MaxRetriesConfigured" END,
        "FinalValidationError" = CASE WHEN p_data ? 'FinalValidationError' THEN (p_data->>'FinalValidationError') ELSE "FinalValidationError" END,
        "ValidationErrorCount" = CASE WHEN p_data ? 'ValidationErrorCount' THEN (p_data->>'ValidationErrorCount')::INT ELSE "ValidationErrorCount" END,
        "CommonValidationError" = CASE WHEN p_data ? 'CommonValidationError' THEN (p_data->>'CommonValidationError') ELSE "CommonValidationError" END,
        "FirstAttemptAt" = CASE WHEN p_data ? 'FirstAttemptAt' THEN (p_data->>'FirstAttemptAt')::TIMESTAMPTZ ELSE "FirstAttemptAt" END,
        "LastAttemptAt" = CASE WHEN p_data ? 'LastAttemptAt' THEN (p_data->>'LastAttemptAt')::TIMESTAMPTZ ELSE "LastAttemptAt" END,
        "TotalRetryDurationMS" = CASE WHEN p_data ? 'TotalRetryDurationMS' THEN (p_data->>'TotalRetryDurationMS')::INT ELSE "TotalRetryDurationMS" END,
        "ValidationAttempts" = CASE WHEN p_data ? 'ValidationAttempts' THEN (p_data->>'ValidationAttempts') ELSE "ValidationAttempts" END,
        "ValidationSummary" = CASE WHEN p_data ? 'ValidationSummary' THEN (p_data->>'ValidationSummary') ELSE "ValidationSummary" END,
        "FailoverAttempts" = CASE WHEN p_data ? 'FailoverAttempts' THEN (p_data->>'FailoverAttempts')::INT ELSE "FailoverAttempts" END,
        "FailoverErrors" = CASE WHEN p_data ? 'FailoverErrors' THEN (p_data->>'FailoverErrors') ELSE "FailoverErrors" END,
        "FailoverDurations" = CASE WHEN p_data ? 'FailoverDurations' THEN (p_data->>'FailoverDurations') ELSE "FailoverDurations" END,
        "OriginalModelID" = CASE WHEN p_data ? 'OriginalModelID' THEN (p_data->>'OriginalModelID')::UUID ELSE "OriginalModelID" END,
        "OriginalRequestStartTime" = CASE WHEN p_data ? 'OriginalRequestStartTime' THEN (p_data->>'OriginalRequestStartTime')::TIMESTAMPTZ ELSE "OriginalRequestStartTime" END,
        "TotalFailoverDuration" = CASE WHEN p_data ? 'TotalFailoverDuration' THEN (p_data->>'TotalFailoverDuration')::INT ELSE "TotalFailoverDuration" END,
        "RerunFromPromptRunID" = CASE WHEN p_data ? 'RerunFromPromptRunID' THEN (p_data->>'RerunFromPromptRunID')::UUID ELSE "RerunFromPromptRunID" END,
        "ModelSelection" = CASE WHEN p_data ? 'ModelSelection' THEN (p_data->>'ModelSelection') ELSE "ModelSelection" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "Cancelled" = CASE WHEN p_data ? 'Cancelled' THEN (p_data->>'Cancelled')::BOOLEAN ELSE "Cancelled" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "ModelPowerRank" = CASE WHEN p_data ? 'ModelPowerRank' THEN (p_data->>'ModelPowerRank')::INT ELSE "ModelPowerRank" END,
        "SelectionStrategy" = CASE WHEN p_data ? 'SelectionStrategy' THEN (p_data->>'SelectionStrategy') ELSE "SelectionStrategy" END,
        "CacheHit" = CASE WHEN p_data ? 'CacheHit' THEN (p_data->>'CacheHit')::BOOLEAN ELSE "CacheHit" END,
        "CacheKey" = CASE WHEN p_data ? 'CacheKey' THEN (p_data->>'CacheKey') ELSE "CacheKey" END,
        "JudgeID" = CASE WHEN p_data ? 'JudgeID' THEN (p_data->>'JudgeID')::UUID ELSE "JudgeID" END,
        "JudgeScore" = CASE WHEN p_data ? 'JudgeScore' THEN (p_data->>'JudgeScore')::FLOAT(53) ELSE "JudgeScore" END,
        "WasSelectedResult" = CASE WHEN p_data ? 'WasSelectedResult' THEN (p_data->>'WasSelectedResult')::BOOLEAN ELSE "WasSelectedResult" END,
        "StreamingEnabled" = CASE WHEN p_data ? 'StreamingEnabled' THEN (p_data->>'StreamingEnabled')::BOOLEAN ELSE "StreamingEnabled" END,
        "FirstTokenTime" = CASE WHEN p_data ? 'FirstTokenTime' THEN (p_data->>'FirstTokenTime')::INT ELSE "FirstTokenTime" END,
        "ErrorDetails" = CASE WHEN p_data ? 'ErrorDetails' THEN (p_data->>'ErrorDetails') ELSE "ErrorDetails" END,
        "ChildPromptID" = CASE WHEN p_data ? 'ChildPromptID' THEN (p_data->>'ChildPromptID')::UUID ELSE "ChildPromptID" END,
        "QueueTime" = CASE WHEN p_data ? 'QueueTime' THEN (p_data->>'QueueTime')::INT ELSE "QueueTime" END,
        "PromptTime" = CASE WHEN p_data ? 'PromptTime' THEN (p_data->>'PromptTime')::INT ELSE "PromptTime" END,
        "CompletionTime" = CASE WHEN p_data ? 'CompletionTime' THEN (p_data->>'CompletionTime')::INT ELSE "CompletionTime" END,
        "ModelSpecificResponseDetails" = CASE WHEN p_data ? 'ModelSpecificResponseDetails' THEN (p_data->>'ModelSpecificResponseDetails') ELSE "ModelSpecificResponseDetails" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "AssistantPrefill" = CASE WHEN p_data ? 'AssistantPrefill' THEN (p_data->>'AssistantPrefill') ELSE "AssistantPrefill" END,
        "TokensCacheRead" = CASE WHEN p_data ? 'TokensCacheRead' THEN (p_data->>'TokensCacheRead')::INT ELSE "TokensCacheRead" END,
        "TokensCacheWrite" = CASE WHEN p_data ? 'TokensCacheWrite' THEN (p_data->>'TokensCacheWrite')::INT ELSE "TokensCacheWrite" END,
        "TokensCacheReadRollup" = CASE WHEN p_data ? 'TokensCacheReadRollup' THEN (p_data->>'TokensCacheReadRollup')::INT ELSE "TokensCacheReadRollup" END,
        "TokensCacheWriteRollup" = CASE WHEN p_data ? 'TokensCacheWriteRollup' THEN (p_data->>'TokensCacheWriteRollup')::INT ELSE "TokensCacheWriteRollup" END,
        "ToolCallingMode" = CASE WHEN p_data ? 'ToolCallingMode' THEN (p_data->>'ToolCallingMode') ELSE "ToolCallingMode" END,
        "UserID" = CASE WHEN p_data ? 'UserID' THEN (p_data->>'UserID')::UUID ELSE "UserID" END,
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
    SELECT * FROM "__mj"."vwAIPromptRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_prompt_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt_run" ON "__mj"."AIPromptRun";

CREATE TRIGGER "trg_update_ai_prompt_run"
BEFORE UPDATE ON "__mj"."AIPromptRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_prompt_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPromptRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIPromptRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: AI Prompt Run Medias records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRunMedia"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.RerunFromPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "RerunFromPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "RerunFromPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIResultCache"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Content Item Tags.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentItemTag"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ContentItemTag"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Content Process Run Prompt Runs records via AIPromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentProcessRunPromptRun"
        WHERE "AIPromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteContentProcessRunPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Compaction Runs records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationCompactionRun"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationCompactionRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DuplicateRunDetailMatch"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DuplicateRunDetailMatch"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Rubric Evaluations.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RubricEvaluation"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RubricEvaluation"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutineRun"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutineRun"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIPromptRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_parent_id"
    ON "__mj"."AIAgent" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_context_compression_prompt_id"
    ON "__mj"."AIAgent" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_type_id"
    ON "__mj"."AIAgent" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_artifact_type_id"
    ON "__mj"."AIAgent" ("DefaultArtifactTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_owner_user_id"
    ON "__mj"."AIAgent" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_attachment_storage_provider_id"
    ON "__mj"."AIAgent" ("AttachmentStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_category_id"
    ON "__mj"."AIAgent" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_storage_account_id"
    ON "__mj"."AIAgent" ("DefaultStorageAccountID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_co_agent_id"
    ON "__mj"."AIAgent" ("DefaultCoAgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_recording_storage_provider_id"
    ON "__mj"."AIAgent" ("RecordingStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_media_collection_id"
    ON "__mj"."AIAgent" ("DefaultMediaCollectionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_conversation_summary_prompt_id"
    ON "__mj"."AIAgent" ("ConversationSummaryPromptID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgent" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgent" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgent" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgent" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgent" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgent" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIAgent"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."AIAgent" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: vwAIAgents
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agents
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgents"
AS
SELECT
    a.*,
    MJAIAgent_ParentID."Name" AS "Parent",
    MJAIPrompt_ContextCompressionPromptID."Name" AS "ContextCompressionPrompt",
    MJAIAgentType_TypeID."Name" AS "Type",
    MJArtifactType_DefaultArtifactTypeID."Name" AS "DefaultArtifactType",
    MJUser_OwnerUserID."Name" AS "OwnerUser",
    MJFileStorageProvider_AttachmentStorageProviderID."Name" AS "AttachmentStorageProvider",
    MJAIAgentCategory_CategoryID."Name" AS "Category",
    MJFileStorageAccount_DefaultStorageAccountID."Name" AS "DefaultStorageAccount",
    MJAIAgent_DefaultCoAgentID."Name" AS "DefaultCoAgent",
    MJFileStorageProvider_RecordingStorageProviderID."Name" AS "RecordingStorageProvider",
    MJCollection_DefaultMediaCollectionID."Name" AS "DefaultMediaCollection",
    MJAIPrompt_ConversationSummaryPromptID."Name" AS "ConversationSummaryPrompt",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."AIAgent" AS a
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_ParentID
  ON
    "a"."ParentID" = MJAIAgent_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ContextCompressionPromptID
  ON
    "a"."ContextCompressionPromptID" = MJAIPrompt_ContextCompressionPromptID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentType" AS MJAIAgentType_TypeID
  ON
    "a"."TypeID" = MJAIAgentType_TypeID."ID"
LEFT OUTER JOIN
    "__mj"."ArtifactType" AS MJArtifactType_DefaultArtifactTypeID
  ON
    "a"."DefaultArtifactTypeID" = MJArtifactType_DefaultArtifactTypeID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_OwnerUserID
  ON
    "a"."OwnerUserID" = MJUser_OwnerUserID."ID"
LEFT OUTER JOIN
    "__mj"."FileStorageProvider" AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    "a"."AttachmentStorageProviderID" = MJFileStorageProvider_AttachmentStorageProviderID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentCategory" AS MJAIAgentCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIAgentCategory_CategoryID."ID"
LEFT OUTER JOIN
    "__mj"."FileStorageAccount" AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    "a"."DefaultStorageAccountID" = MJFileStorageAccount_DefaultStorageAccountID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_DefaultCoAgentID
  ON
    "a"."DefaultCoAgentID" = MJAIAgent_DefaultCoAgentID."ID"
LEFT OUTER JOIN
    "__mj"."FileStorageProvider" AS MJFileStorageProvider_RecordingStorageProviderID
  ON
    "a"."RecordingStorageProviderID" = MJFileStorageProvider_RecordingStorageProviderID."ID"
LEFT OUTER JOIN
    "__mj"."Collection" AS MJCollection_DefaultMediaCollectionID
  ON
    "a"."DefaultMediaCollectionID" = MJCollection_DefaultMediaCollectionID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ConversationSummaryPromptID
  ON
    "a"."ConversationSummaryPromptID" = MJAIPrompt_ConversationSummaryPromptID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_agent_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
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
        AND tc.relname = 'vwAIAgents'
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
                           AND tc.relname = 'vwAIAgents'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgents" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIAgents" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgents" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgents" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spCreateAIAgent
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgent (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgent"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgents"
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
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration', 'AllowMemoryWrite', 'RecordingDefault', 'RecordingStorageProviderID', 'DefaultMediaCollectionID', 'SupportsPlanMode', 'AcceptsSkills', 'SkillActivationMode', 'RequirePlanMode', 'ContextWindowMaxTokens', 'CompactionTriggerPercent', 'CompactionTargetPercent', 'ConversationSummaryPromptID', 'DeclareActionsAsNativeTools']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'Name' THEN '($1->>''Name'')'
        WHEN 'Description' THEN '($1->>''Description'')'
        WHEN 'LogoURL' THEN '($1->>''LogoURL'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'ExposeAsAction' THEN 'COALESCE(($1->>''ExposeAsAction'')::BOOLEAN, FALSE)'
        WHEN 'ExecutionOrder' THEN 'COALESCE(($1->>''ExecutionOrder'')::INT, 0)'
        WHEN 'ExecutionMode' THEN 'COALESCE(($1->>''ExecutionMode''), ''Sequential'')'
        WHEN 'EnableContextCompression' THEN 'COALESCE(($1->>''EnableContextCompression'')::BOOLEAN, FALSE)'
        WHEN 'ContextCompressionMessageThreshold' THEN '($1->>''ContextCompressionMessageThreshold'')::INT'
        WHEN 'ContextCompressionPromptID' THEN '($1->>''ContextCompressionPromptID'')::UUID'
        WHEN 'ContextCompressionMessageRetentionCount' THEN '($1->>''ContextCompressionMessageRetentionCount'')::INT'
        WHEN 'TypeID' THEN '($1->>''TypeID'')::UUID'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'DriverClass' THEN '($1->>''DriverClass'')'
        WHEN 'IconClass' THEN '($1->>''IconClass'')'
        WHEN 'ModelSelectionMode' THEN 'COALESCE(($1->>''ModelSelectionMode''), ''Agent Type'')'
        WHEN 'PayloadDownstreamPaths' THEN 'COALESCE(($1->>''PayloadDownstreamPaths''), ''["*"]'')'
        WHEN 'PayloadUpstreamPaths' THEN 'COALESCE(($1->>''PayloadUpstreamPaths''), ''["*"]'')'
        WHEN 'PayloadSelfReadPaths' THEN '($1->>''PayloadSelfReadPaths'')'
        WHEN 'PayloadSelfWritePaths' THEN '($1->>''PayloadSelfWritePaths'')'
        WHEN 'PayloadScope' THEN '($1->>''PayloadScope'')'
        WHEN 'FinalPayloadValidation' THEN '($1->>''FinalPayloadValidation'')'
        WHEN 'FinalPayloadValidationMode' THEN 'COALESCE(($1->>''FinalPayloadValidationMode''), ''Retry'')'
        WHEN 'FinalPayloadValidationMaxRetries' THEN 'COALESCE(($1->>''FinalPayloadValidationMaxRetries'')::INT, 3)'
        WHEN 'MaxCostPerRun' THEN '($1->>''MaxCostPerRun'')::DECIMAL(10, 4)'
        WHEN 'MaxTokensPerRun' THEN '($1->>''MaxTokensPerRun'')::INT'
        WHEN 'MaxIterationsPerRun' THEN '($1->>''MaxIterationsPerRun'')::INT'
        WHEN 'MaxTimePerRun' THEN '($1->>''MaxTimePerRun'')::INT'
        WHEN 'MinExecutionsPerRun' THEN '($1->>''MinExecutionsPerRun'')::INT'
        WHEN 'MaxExecutionsPerRun' THEN '($1->>''MaxExecutionsPerRun'')::INT'
        WHEN 'StartingPayloadValidation' THEN '($1->>''StartingPayloadValidation'')'
        WHEN 'StartingPayloadValidationMode' THEN 'COALESCE(($1->>''StartingPayloadValidationMode''), ''Fail'')'
        WHEN 'DefaultPromptEffortLevel' THEN '($1->>''DefaultPromptEffortLevel'')::INT'
        WHEN 'ChatHandlingOption' THEN '($1->>''ChatHandlingOption'')'
        WHEN 'DefaultArtifactTypeID' THEN '($1->>''DefaultArtifactTypeID'')::UUID'
        WHEN 'OwnerUserID' THEN 'CASE WHEN ($1->>''OwnerUserID'')::UUID = ''00000000-0000-0000-0000-000000000000''::uuid THEN ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'' ELSE COALESCE(($1->>''OwnerUserID'')::UUID, ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'') END'
        WHEN 'InvocationMode' THEN 'COALESCE(($1->>''InvocationMode''), ''Any'')'
        WHEN 'ArtifactCreationMode' THEN 'COALESCE(($1->>''ArtifactCreationMode''), ''Always'')'
        WHEN 'FunctionalRequirements' THEN '($1->>''FunctionalRequirements'')'
        WHEN 'TechnicalDesign' THEN '($1->>''TechnicalDesign'')'
        WHEN 'InjectNotes' THEN 'COALESCE(($1->>''InjectNotes'')::BOOLEAN, TRUE)'
        WHEN 'MaxNotesToInject' THEN 'COALESCE(($1->>''MaxNotesToInject'')::INT, 5)'
        WHEN 'NoteInjectionStrategy' THEN 'COALESCE(($1->>''NoteInjectionStrategy''), ''Relevant'')'
        WHEN 'InjectExamples' THEN 'COALESCE(($1->>''InjectExamples'')::BOOLEAN, FALSE)'
        WHEN 'MaxExamplesToInject' THEN 'COALESCE(($1->>''MaxExamplesToInject'')::INT, 3)'
        WHEN 'ExampleInjectionStrategy' THEN 'COALESCE(($1->>''ExampleInjectionStrategy''), ''Semantic'')'
        WHEN 'IsRestricted' THEN 'COALESCE(($1->>''IsRestricted'')::BOOLEAN, FALSE)'
        WHEN 'MessageMode' THEN 'COALESCE(($1->>''MessageMode''), ''None'')'
        WHEN 'MaxMessages' THEN '($1->>''MaxMessages'')::INT'
        WHEN 'AttachmentStorageProviderID' THEN '($1->>''AttachmentStorageProviderID'')::UUID'
        WHEN 'AttachmentRootPath' THEN '($1->>''AttachmentRootPath'')'
        WHEN 'InlineStorageThresholdBytes' THEN '($1->>''InlineStorageThresholdBytes'')::INT'
        WHEN 'AgentTypePromptParams' THEN '($1->>''AgentTypePromptParams'')'
        WHEN 'ScopeConfig' THEN '($1->>''ScopeConfig'')'
        WHEN 'NoteRetentionDays' THEN '($1->>''NoteRetentionDays'')::INT'
        WHEN 'ExampleRetentionDays' THEN '($1->>''ExampleRetentionDays'')::INT'
        WHEN 'AutoArchiveEnabled' THEN 'COALESCE(($1->>''AutoArchiveEnabled'')::BOOLEAN, TRUE)'
        WHEN 'RerankerConfiguration' THEN '($1->>''RerankerConfiguration'')'
        WHEN 'CategoryID' THEN '($1->>''CategoryID'')::UUID'
        WHEN 'AllowEphemeralClientTools' THEN 'COALESCE(($1->>''AllowEphemeralClientTools'')::BOOLEAN, TRUE)'
        WHEN 'DefaultStorageAccountID' THEN '($1->>''DefaultStorageAccountID'')::UUID'
        WHEN 'SearchScopeAccess' THEN 'COALESCE(($1->>''SearchScopeAccess''), ''None'')'
        WHEN 'AcceptUnregisteredFiles' THEN 'COALESCE(($1->>''AcceptUnregisteredFiles'')::BOOLEAN, FALSE)'
        WHEN 'DefaultCoAgentID' THEN '($1->>''DefaultCoAgentID'')::UUID'
        WHEN 'TypeConfiguration' THEN '($1->>''TypeConfiguration'')'
        WHEN 'AllowMemoryWrite' THEN 'COALESCE(($1->>''AllowMemoryWrite'')::BOOLEAN, TRUE)'
        WHEN 'RecordingDefault' THEN '($1->>''RecordingDefault'')'
        WHEN 'RecordingStorageProviderID' THEN '($1->>''RecordingStorageProviderID'')::UUID'
        WHEN 'DefaultMediaCollectionID' THEN '($1->>''DefaultMediaCollectionID'')::UUID'
        WHEN 'SupportsPlanMode' THEN 'COALESCE(($1->>''SupportsPlanMode'')::BOOLEAN, TRUE)'
        WHEN 'AcceptsSkills' THEN 'COALESCE(($1->>''AcceptsSkills''), ''None'')'
        WHEN 'SkillActivationMode' THEN 'COALESCE(($1->>''SkillActivationMode''), ''RequestedOnly'')'
        WHEN 'RequirePlanMode' THEN 'COALESCE(($1->>''RequirePlanMode'')::BOOLEAN, FALSE)'
        WHEN 'ContextWindowMaxTokens' THEN '($1->>''ContextWindowMaxTokens'')::INT'
        WHEN 'CompactionTriggerPercent' THEN '($1->>''CompactionTriggerPercent'')::INT'
        WHEN 'CompactionTargetPercent' THEN '($1->>''CompactionTargetPercent'')::INT'
        WHEN 'ConversationSummaryPromptID' THEN '($1->>''ConversationSummaryPromptID'')::UUID'
        WHEN 'DeclareActionsAsNativeTools' THEN 'COALESCE(($1->>''DeclareActionsAsNativeTools'')::BOOLEAN, TRUE)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIAgent" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgent" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spUpdateAIAgent
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgent (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgent"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgents"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgent: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIAgent"
    SET
        "Name" = CASE WHEN p_data ? 'Name' THEN (p_data->>'Name') ELSE "Name" END,
        "Description" = CASE WHEN p_data ? 'Description' THEN (p_data->>'Description') ELSE "Description" END,
        "LogoURL" = CASE WHEN p_data ? 'LogoURL' THEN (p_data->>'LogoURL') ELSE "LogoURL" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "ExposeAsAction" = CASE WHEN p_data ? 'ExposeAsAction' THEN (p_data->>'ExposeAsAction')::BOOLEAN ELSE "ExposeAsAction" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INT ELSE "ExecutionOrder" END,
        "ExecutionMode" = CASE WHEN p_data ? 'ExecutionMode' THEN (p_data->>'ExecutionMode') ELSE "ExecutionMode" END,
        "EnableContextCompression" = CASE WHEN p_data ? 'EnableContextCompression' THEN (p_data->>'EnableContextCompression')::BOOLEAN ELSE "EnableContextCompression" END,
        "ContextCompressionMessageThreshold" = CASE WHEN p_data ? 'ContextCompressionMessageThreshold' THEN (p_data->>'ContextCompressionMessageThreshold')::INT ELSE "ContextCompressionMessageThreshold" END,
        "ContextCompressionPromptID" = CASE WHEN p_data ? 'ContextCompressionPromptID' THEN (p_data->>'ContextCompressionPromptID')::UUID ELSE "ContextCompressionPromptID" END,
        "ContextCompressionMessageRetentionCount" = CASE WHEN p_data ? 'ContextCompressionMessageRetentionCount' THEN (p_data->>'ContextCompressionMessageRetentionCount')::INT ELSE "ContextCompressionMessageRetentionCount" END,
        "TypeID" = CASE WHEN p_data ? 'TypeID' THEN (p_data->>'TypeID')::UUID ELSE "TypeID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "DriverClass" = CASE WHEN p_data ? 'DriverClass' THEN (p_data->>'DriverClass') ELSE "DriverClass" END,
        "IconClass" = CASE WHEN p_data ? 'IconClass' THEN (p_data->>'IconClass') ELSE "IconClass" END,
        "ModelSelectionMode" = CASE WHEN p_data ? 'ModelSelectionMode' THEN (p_data->>'ModelSelectionMode') ELSE "ModelSelectionMode" END,
        "PayloadDownstreamPaths" = CASE WHEN p_data ? 'PayloadDownstreamPaths' THEN (p_data->>'PayloadDownstreamPaths') ELSE "PayloadDownstreamPaths" END,
        "PayloadUpstreamPaths" = CASE WHEN p_data ? 'PayloadUpstreamPaths' THEN (p_data->>'PayloadUpstreamPaths') ELSE "PayloadUpstreamPaths" END,
        "PayloadSelfReadPaths" = CASE WHEN p_data ? 'PayloadSelfReadPaths' THEN (p_data->>'PayloadSelfReadPaths') ELSE "PayloadSelfReadPaths" END,
        "PayloadSelfWritePaths" = CASE WHEN p_data ? 'PayloadSelfWritePaths' THEN (p_data->>'PayloadSelfWritePaths') ELSE "PayloadSelfWritePaths" END,
        "PayloadScope" = CASE WHEN p_data ? 'PayloadScope' THEN (p_data->>'PayloadScope') ELSE "PayloadScope" END,
        "FinalPayloadValidation" = CASE WHEN p_data ? 'FinalPayloadValidation' THEN (p_data->>'FinalPayloadValidation') ELSE "FinalPayloadValidation" END,
        "FinalPayloadValidationMode" = CASE WHEN p_data ? 'FinalPayloadValidationMode' THEN (p_data->>'FinalPayloadValidationMode') ELSE "FinalPayloadValidationMode" END,
        "FinalPayloadValidationMaxRetries" = CASE WHEN p_data ? 'FinalPayloadValidationMaxRetries' THEN (p_data->>'FinalPayloadValidationMaxRetries')::INT ELSE "FinalPayloadValidationMaxRetries" END,
        "MaxCostPerRun" = CASE WHEN p_data ? 'MaxCostPerRun' THEN (p_data->>'MaxCostPerRun')::DECIMAL(10, 4) ELSE "MaxCostPerRun" END,
        "MaxTokensPerRun" = CASE WHEN p_data ? 'MaxTokensPerRun' THEN (p_data->>'MaxTokensPerRun')::INT ELSE "MaxTokensPerRun" END,
        "MaxIterationsPerRun" = CASE WHEN p_data ? 'MaxIterationsPerRun' THEN (p_data->>'MaxIterationsPerRun')::INT ELSE "MaxIterationsPerRun" END,
        "MaxTimePerRun" = CASE WHEN p_data ? 'MaxTimePerRun' THEN (p_data->>'MaxTimePerRun')::INT ELSE "MaxTimePerRun" END,
        "MinExecutionsPerRun" = CASE WHEN p_data ? 'MinExecutionsPerRun' THEN (p_data->>'MinExecutionsPerRun')::INT ELSE "MinExecutionsPerRun" END,
        "MaxExecutionsPerRun" = CASE WHEN p_data ? 'MaxExecutionsPerRun' THEN (p_data->>'MaxExecutionsPerRun')::INT ELSE "MaxExecutionsPerRun" END,
        "StartingPayloadValidation" = CASE WHEN p_data ? 'StartingPayloadValidation' THEN (p_data->>'StartingPayloadValidation') ELSE "StartingPayloadValidation" END,
        "StartingPayloadValidationMode" = CASE WHEN p_data ? 'StartingPayloadValidationMode' THEN (p_data->>'StartingPayloadValidationMode') ELSE "StartingPayloadValidationMode" END,
        "DefaultPromptEffortLevel" = CASE WHEN p_data ? 'DefaultPromptEffortLevel' THEN (p_data->>'DefaultPromptEffortLevel')::INT ELSE "DefaultPromptEffortLevel" END,
        "ChatHandlingOption" = CASE WHEN p_data ? 'ChatHandlingOption' THEN (p_data->>'ChatHandlingOption') ELSE "ChatHandlingOption" END,
        "DefaultArtifactTypeID" = CASE WHEN p_data ? 'DefaultArtifactTypeID' THEN (p_data->>'DefaultArtifactTypeID')::UUID ELSE "DefaultArtifactTypeID" END,
        "OwnerUserID" = CASE WHEN p_data ? 'OwnerUserID' THEN (p_data->>'OwnerUserID')::UUID ELSE "OwnerUserID" END,
        "InvocationMode" = CASE WHEN p_data ? 'InvocationMode' THEN (p_data->>'InvocationMode') ELSE "InvocationMode" END,
        "ArtifactCreationMode" = CASE WHEN p_data ? 'ArtifactCreationMode' THEN (p_data->>'ArtifactCreationMode') ELSE "ArtifactCreationMode" END,
        "FunctionalRequirements" = CASE WHEN p_data ? 'FunctionalRequirements' THEN (p_data->>'FunctionalRequirements') ELSE "FunctionalRequirements" END,
        "TechnicalDesign" = CASE WHEN p_data ? 'TechnicalDesign' THEN (p_data->>'TechnicalDesign') ELSE "TechnicalDesign" END,
        "InjectNotes" = CASE WHEN p_data ? 'InjectNotes' THEN (p_data->>'InjectNotes')::BOOLEAN ELSE "InjectNotes" END,
        "MaxNotesToInject" = CASE WHEN p_data ? 'MaxNotesToInject' THEN (p_data->>'MaxNotesToInject')::INT ELSE "MaxNotesToInject" END,
        "NoteInjectionStrategy" = CASE WHEN p_data ? 'NoteInjectionStrategy' THEN (p_data->>'NoteInjectionStrategy') ELSE "NoteInjectionStrategy" END,
        "InjectExamples" = CASE WHEN p_data ? 'InjectExamples' THEN (p_data->>'InjectExamples')::BOOLEAN ELSE "InjectExamples" END,
        "MaxExamplesToInject" = CASE WHEN p_data ? 'MaxExamplesToInject' THEN (p_data->>'MaxExamplesToInject')::INT ELSE "MaxExamplesToInject" END,
        "ExampleInjectionStrategy" = CASE WHEN p_data ? 'ExampleInjectionStrategy' THEN (p_data->>'ExampleInjectionStrategy') ELSE "ExampleInjectionStrategy" END,
        "IsRestricted" = CASE WHEN p_data ? 'IsRestricted' THEN (p_data->>'IsRestricted')::BOOLEAN ELSE "IsRestricted" END,
        "MessageMode" = CASE WHEN p_data ? 'MessageMode' THEN (p_data->>'MessageMode') ELSE "MessageMode" END,
        "MaxMessages" = CASE WHEN p_data ? 'MaxMessages' THEN (p_data->>'MaxMessages')::INT ELSE "MaxMessages" END,
        "AttachmentStorageProviderID" = CASE WHEN p_data ? 'AttachmentStorageProviderID' THEN (p_data->>'AttachmentStorageProviderID')::UUID ELSE "AttachmentStorageProviderID" END,
        "AttachmentRootPath" = CASE WHEN p_data ? 'AttachmentRootPath' THEN (p_data->>'AttachmentRootPath') ELSE "AttachmentRootPath" END,
        "InlineStorageThresholdBytes" = CASE WHEN p_data ? 'InlineStorageThresholdBytes' THEN (p_data->>'InlineStorageThresholdBytes')::INT ELSE "InlineStorageThresholdBytes" END,
        "AgentTypePromptParams" = CASE WHEN p_data ? 'AgentTypePromptParams' THEN (p_data->>'AgentTypePromptParams') ELSE "AgentTypePromptParams" END,
        "ScopeConfig" = CASE WHEN p_data ? 'ScopeConfig' THEN (p_data->>'ScopeConfig') ELSE "ScopeConfig" END,
        "NoteRetentionDays" = CASE WHEN p_data ? 'NoteRetentionDays' THEN (p_data->>'NoteRetentionDays')::INT ELSE "NoteRetentionDays" END,
        "ExampleRetentionDays" = CASE WHEN p_data ? 'ExampleRetentionDays' THEN (p_data->>'ExampleRetentionDays')::INT ELSE "ExampleRetentionDays" END,
        "AutoArchiveEnabled" = CASE WHEN p_data ? 'AutoArchiveEnabled' THEN (p_data->>'AutoArchiveEnabled')::BOOLEAN ELSE "AutoArchiveEnabled" END,
        "RerankerConfiguration" = CASE WHEN p_data ? 'RerankerConfiguration' THEN (p_data->>'RerankerConfiguration') ELSE "RerankerConfiguration" END,
        "CategoryID" = CASE WHEN p_data ? 'CategoryID' THEN (p_data->>'CategoryID')::UUID ELSE "CategoryID" END,
        "AllowEphemeralClientTools" = CASE WHEN p_data ? 'AllowEphemeralClientTools' THEN (p_data->>'AllowEphemeralClientTools')::BOOLEAN ELSE "AllowEphemeralClientTools" END,
        "DefaultStorageAccountID" = CASE WHEN p_data ? 'DefaultStorageAccountID' THEN (p_data->>'DefaultStorageAccountID')::UUID ELSE "DefaultStorageAccountID" END,
        "SearchScopeAccess" = CASE WHEN p_data ? 'SearchScopeAccess' THEN (p_data->>'SearchScopeAccess') ELSE "SearchScopeAccess" END,
        "AcceptUnregisteredFiles" = CASE WHEN p_data ? 'AcceptUnregisteredFiles' THEN (p_data->>'AcceptUnregisteredFiles')::BOOLEAN ELSE "AcceptUnregisteredFiles" END,
        "DefaultCoAgentID" = CASE WHEN p_data ? 'DefaultCoAgentID' THEN (p_data->>'DefaultCoAgentID')::UUID ELSE "DefaultCoAgentID" END,
        "TypeConfiguration" = CASE WHEN p_data ? 'TypeConfiguration' THEN (p_data->>'TypeConfiguration') ELSE "TypeConfiguration" END,
        "AllowMemoryWrite" = CASE WHEN p_data ? 'AllowMemoryWrite' THEN (p_data->>'AllowMemoryWrite')::BOOLEAN ELSE "AllowMemoryWrite" END,
        "RecordingDefault" = CASE WHEN p_data ? 'RecordingDefault' THEN (p_data->>'RecordingDefault') ELSE "RecordingDefault" END,
        "RecordingStorageProviderID" = CASE WHEN p_data ? 'RecordingStorageProviderID' THEN (p_data->>'RecordingStorageProviderID')::UUID ELSE "RecordingStorageProviderID" END,
        "DefaultMediaCollectionID" = CASE WHEN p_data ? 'DefaultMediaCollectionID' THEN (p_data->>'DefaultMediaCollectionID')::UUID ELSE "DefaultMediaCollectionID" END,
        "SupportsPlanMode" = CASE WHEN p_data ? 'SupportsPlanMode' THEN (p_data->>'SupportsPlanMode')::BOOLEAN ELSE "SupportsPlanMode" END,
        "AcceptsSkills" = CASE WHEN p_data ? 'AcceptsSkills' THEN (p_data->>'AcceptsSkills') ELSE "AcceptsSkills" END,
        "SkillActivationMode" = CASE WHEN p_data ? 'SkillActivationMode' THEN (p_data->>'SkillActivationMode') ELSE "SkillActivationMode" END,
        "RequirePlanMode" = CASE WHEN p_data ? 'RequirePlanMode' THEN (p_data->>'RequirePlanMode')::BOOLEAN ELSE "RequirePlanMode" END,
        "ContextWindowMaxTokens" = CASE WHEN p_data ? 'ContextWindowMaxTokens' THEN (p_data->>'ContextWindowMaxTokens')::INT ELSE "ContextWindowMaxTokens" END,
        "CompactionTriggerPercent" = CASE WHEN p_data ? 'CompactionTriggerPercent' THEN (p_data->>'CompactionTriggerPercent')::INT ELSE "CompactionTriggerPercent" END,
        "CompactionTargetPercent" = CASE WHEN p_data ? 'CompactionTargetPercent' THEN (p_data->>'CompactionTargetPercent')::INT ELSE "CompactionTargetPercent" END,
        "ConversationSummaryPromptID" = CASE WHEN p_data ? 'ConversationSummaryPromptID' THEN (p_data->>'ConversationSummaryPromptID')::UUID ELSE "ConversationSummaryPromptID" END,
        "DeclareActionsAsNativeTools" = CASE WHEN p_data ? 'DeclareActionsAsNativeTools' THEN (p_data->>'DeclareActionsAsNativeTools')::BOOLEAN ELSE "DeclareActionsAsNativeTools" END,
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
    SELECT * FROM "__mj"."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent" ON "__mj"."AIAgent";

CREATE TRIGGER "trg_update_ai_agent"
BEFORE UPDATE ON "__mj"."AIAgent"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgent"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Actions.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentAction"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentAction"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Artifact Types records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentArtifactType"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentArtifactType"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Client Tools records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentClientTool"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentClientTool"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Co Agents records via CoAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentCoAgent"
        WHERE "CoAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentCoAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Co Agents.TargetAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentCoAgent"
        WHERE "TargetAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentCoAgent"
        SET "TargetAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Configurations records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentConfiguration"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentConfiguration"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Credentials records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentCredential"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentCredential"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Data Sources records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentDataSource"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentDataSource"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Examples records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentExample"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentExample"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Learning Cycles records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentLearningCycle"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentLearningCycle"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Modalities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentModality"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentModality"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Models.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentModel"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentModel"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentNote"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentNote"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Permissions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPermission"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Personas records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPersona"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPersona"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPrompt"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRelationship"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRelationship"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Requests records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRequest"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Rubrics records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRubric"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRubric"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Runs records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Search Scopes records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentSearchScope"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentSearchScope"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Sessions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentSession"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentSession"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Skills records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentSkill"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentSkill"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Steps records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentStep"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.SubAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentStep"
        WHERE "SubAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentStep"
        SET "SubAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.DefaultCoAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "DefaultCoAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "DefaultCoAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Bridge Agent Identities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIBridgeAgentIdentity"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIBridgeAgentIdentity"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIResultCache"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Skill Sub Agents records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AISkillSubAgent"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAISkillSubAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Actions.CreatedByAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Action"
        WHERE "CreatedByAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Action"
        SET "CreatedByAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationDetail"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ConversationDetail"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Widget Instances records via PinnedAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationWidgetInstance"
        WHERE "PinnedAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationWidgetInstance"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversations.DefaultAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Conversation"
        WHERE "DefaultAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Conversation"
        SET "DefaultAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Entity Documents.ReasoningAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityDocument"
        WHERE "ReasoningAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."EntityDocument"
        SET "ReasoningAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RecordProcess"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RecordProcess"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Search Execution Logs.AIAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."SearchExecutionLog"
        WHERE "AIAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."SearchExecutionLog"
        SET "AIAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIAgent"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgent" TO "cdp_Integration";
