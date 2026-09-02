-- =====================================================================================
-- Widen the ML ProblemType domain with 'sequence'  (PostgreSQL twin)
--
-- See the SQL Server counterpart for the reasoning. Additive only: the existing values keep
-- working unchanged and no row is rewritten.
-- =====================================================================================

-- ── MJ: ML Training Pipelines ────────────────────────────────────────────────────────
ALTER TABLE ${flyway:defaultSchema}."MLTrainingPipeline"
    DROP CONSTRAINT IF EXISTS "CK_MLTrainingPipeline_ProblemType";

ALTER TABLE ${flyway:defaultSchema}."MLTrainingPipeline"
    ADD CONSTRAINT "CK_MLTrainingPipeline_ProblemType"
        CHECK ("ProblemType" IN ('classification', 'regression', 'sequence'));

-- ── MJ: ML Models ────────────────────────────────────────────────────────────────────
ALTER TABLE ${flyway:defaultSchema}."MLModel"
    DROP CONSTRAINT IF EXISTS "CK_MLModel_ProblemType";

ALTER TABLE ${flyway:defaultSchema}."MLModel"
    ADD CONSTRAINT "CK_MLModel_ProblemType"
        CHECK ("ProblemType" IN ('classification', 'regression', 'sequence'));

-- ── MJ: ML Algorithm Use Cases ───────────────────────────────────────────────────────
ALTER TABLE ${flyway:defaultSchema}."MLAlgorithmUseCase"
    DROP CONSTRAINT IF EXISTS "CK_MLAlgorithmUseCase_ProblemTypeScope";

ALTER TABLE ${flyway:defaultSchema}."MLAlgorithmUseCase"
    ADD CONSTRAINT "CK_MLAlgorithmUseCase_ProblemTypeScope"
        CHECK ("ProblemTypeScope" IN ('classification', 'regression', 'sequence', 'any'));
