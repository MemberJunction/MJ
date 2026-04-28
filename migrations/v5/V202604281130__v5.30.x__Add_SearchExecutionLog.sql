-- =============================================================================
-- Migration: SearchExecutionLog (RAG+ Phase 3.1)
-- Version:   v5.30.x
-- Plan:      RAG_plan.md §3 Phase 3.1, ~/.claude/plans/make-a-plan-for-buzzing-sky.md
-- =============================================================================
-- One row per search invocation against the SearchEngine. Captures everything
-- the analytics dashboard (Phase 3.3) and per-scope CSV export (Phase 3.4)
-- need to reconstruct usage patterns: scope + user + agent identity, query
-- text, timing, result count, reranker info + cost, status, and per-provider
-- duration / count breakdown in a JSON blob.
--
-- Notes:
--   - Query is nvarchar(max) — some queries are long (full sentences, snippets)
--   - All FKs nullable because some invocations come from anonymized callers
--     and not every search uses a reranker / scope / agent identity
--   - ProvidersJSON is nvarchar(max) holding an array of {Provider, DurationMs,
--     ResultCount, ErrorMessage}
--   - No __mj_* timestamp columns, no manual FK indexes (CodeGen handles)
--   - No seed data
-- =============================================================================

CREATE TABLE ${flyway:defaultSchema}.SearchExecutionLog (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SearchScopeID UNIQUEIDENTIFIER NULL,
    UserID UNIQUEIDENTIFIER NULL,
    AIAgentID UNIQUEIDENTIFIER NULL,
    Query NVARCHAR(MAX) NOT NULL,
    TotalDurationMs INT NOT NULL,
    ResultCount INT NOT NULL DEFAULT 0,
    RerankerName NVARCHAR(100) NULL,
    RerankerCostCents DECIMAL(10, 4) NULL,
    Status NVARCHAR(20) NOT NULL,
    FailureReason NVARCHAR(500) NULL,
    ProvidersJSON NVARCHAR(MAX) NULL,
    CONSTRAINT PK_SearchExecutionLog PRIMARY KEY (ID),
    CONSTRAINT FK_SearchExecutionLog_SearchScope FOREIGN KEY (SearchScopeID)
        REFERENCES ${flyway:defaultSchema}.SearchScope(ID),
    CONSTRAINT FK_SearchExecutionLog_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_SearchExecutionLog_AIAgent FOREIGN KEY (AIAgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT CK_SearchExecutionLog_Status
        CHECK (Status IN (N'Success', N'Failure', N'Forbidden'))
);
GO

-- Extended properties (column descriptions feed CodeGen's TSDoc on the entity wrapper)

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'One row per SearchEngine.search invocation. Populated by SearchEngine''s post-fusion logging hook (Phase 3.2). Read by the Knowledge Hub Search Analytics dashboard (Phase 3.3) and the per-scope tuning CSV export (Phase 3.4).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The SearchScope this invocation targeted. NULL for unscoped global search.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'SearchScopeID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The User who initiated the search. NULL for system / unauthenticated callers.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'UserID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The AIAgent identity if the search was invoked from an agent (e.g. ScopedSearchAction). NULL for direct human-initiated searches.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'AIAgentID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Raw query string the user / agent submitted. NVARCHAR(MAX) because some queries are long (full sentences, snippets). Stored verbatim for analytics — do NOT rely on this for permission decisions.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'Query';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'End-to-end search duration in milliseconds, measured at the SearchEngine.search call boundary (provider runs + fusion + rerank + permission filter + enrichment).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'TotalDurationMs';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of results returned to the caller after permission filtering, deduplication, and score-threshold trimming. Use this as the hit-rate denominator (rows where ResultCount > 0).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'ResultCount';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'BaseReRanker.Name of the reranker that ran (e.g. ''Cohere'', ''Voyage'', ''OpenAI'', ''BGE'', ''NoopReRanker''). NULL when no rerank stage executed for this invocation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'RerankerName';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total reranker spend in cents for this invocation, populated from the BaseReRanker.CostReporter callback via RerankerBudgetGuard. NULL when no rerank ran or no real-provider cost was incurred (Noop / BGE).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'RerankerCostCents';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Outcome of the search: ''Success'' (results returned, possibly empty), ''Failure'' (an exception bubbled out — see FailureReason), ''Forbidden'' (the caller lacked SearchScopePermission for the requested scope). Constrained by CK_SearchExecutionLog_Status.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short human-readable failure reason when Status = ''Failure'' or ''Forbidden''. NULL on success.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'FailureReason';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of per-provider breakdown entries: [{"Provider":"Vector","DurationMs":123,"ResultCount":5,"ErrorMessage":null}, ...]. Used by the analytics dashboard for p50/p95 latency-by-provider charts and to spot consistently slow providers.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'ProvidersJSON';
GO
