-- =====================================================================================
-- Widen the ML ProblemType domain with 'sequence'
--
-- Every problem type so far answers a per-RECORD question: given this record's features, what is
-- the answer for this record. A sequence model answers a different one — given a record's history
-- IN ORDER, which latent state is it in now. Renewal risk that builds over four quarters of
-- declining engagement is a different shape of question from renewal risk read off one snapshot,
-- and flattening it into per-row features discards the ordering that carried the signal.
--
-- This is additive only: the two existing values keep working unchanged, and nothing is rewritten.
-- The `Sequence` / `Hidden Markov Model` component types stay Status='Draft' until this migration
-- has been applied AND CodeGen has regenerated the entity types — until then the generated zod
-- union still rejects 'sequence' at save time, which is the correct, loud failure.
--
-- Also widens MLAlgorithmUseCase.ProblemTypeScope so a use case can be scoped to sequence work.
-- `ProblemTypeScope` already carries 'any', which continues to mean "all types", now including
-- 'sequence'.
-- =====================================================================================

-- ── MJ: ML Training Pipelines ────────────────────────────────────────────────────────
ALTER TABLE ${flyway:defaultSchema}.MLTrainingPipeline
    DROP CONSTRAINT CK_MLTrainingPipeline_ProblemType;
GO

ALTER TABLE ${flyway:defaultSchema}.MLTrainingPipeline
    ADD CONSTRAINT CK_MLTrainingPipeline_ProblemType
        CHECK ([ProblemType] IN ('classification', 'regression', 'sequence'));
GO

-- ── MJ: ML Models ────────────────────────────────────────────────────────────────────
ALTER TABLE ${flyway:defaultSchema}.MLModel
    DROP CONSTRAINT CK_MLModel_ProblemType;
GO

ALTER TABLE ${flyway:defaultSchema}.MLModel
    ADD CONSTRAINT CK_MLModel_ProblemType
        CHECK ([ProblemType] IN ('classification', 'regression', 'sequence'));
GO

-- ── MJ: ML Algorithm Use Cases ───────────────────────────────────────────────────────
ALTER TABLE ${flyway:defaultSchema}.MLAlgorithmUseCase
    DROP CONSTRAINT CK_MLAlgorithmUseCase_ProblemTypeScope;
GO

ALTER TABLE ${flyway:defaultSchema}.MLAlgorithmUseCase
    ADD CONSTRAINT CK_MLAlgorithmUseCase_ProblemTypeScope
        CHECK ([ProblemTypeScope] IN ('classification', 'regression', 'sequence', 'any'));
GO
