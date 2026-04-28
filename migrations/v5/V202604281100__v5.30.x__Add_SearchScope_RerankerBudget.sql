-- =============================================================================
-- Migration: SearchScope reranker budget (RAG+ Phase 2D)
-- Version:   v5.30.x
-- Plan:      RAG_plan.md §3 Phase 2D.6, ~/.claude/plans/make-a-plan-for-buzzing-sky.md
-- =============================================================================
-- Adds a per-scope cents-budget that caps how much real-provider reranker spend
-- (Cohere, Voyage, OpenAI) can occur on a single search invocation. The budget
-- guard short-circuits before each rerank call when the projected cost would
-- exceed the remaining budget, and accumulates actual cost reported by each
-- reranker through the BaseReRanker.CostReporter callback (P2D.1).
--
-- Behavior with NULL: no cap. Existing scopes keep behaving exactly as before.
--
-- Notes:
--   - No __mj_* timestamp columns, no manual indexes (CodeGen handles)
--   - No seed data (admins author values through the SearchScope form in P2D.7)
-- =============================================================================

ALTER TABLE ${flyway:defaultSchema}.SearchScope
    ADD RerankerBudgetCents INT NULL;
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional cap on reranker spend (in cents) per search invocation against this scope. NULL means uncapped — existing behavior. When set, the SearchEngine''s budget guard short-circuits any reranker call whose projected cost would push the run total past this value, and accumulates actual post-call cost via each reranker''s CostReporter callback (BaseReRanker.CostReporter). Real-provider rerankers (Cohere, Voyage, OpenAI) report cost; NoopReRanker and BGEReRanker report zero (local / pass-through).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'RerankerBudgetCents';
GO
