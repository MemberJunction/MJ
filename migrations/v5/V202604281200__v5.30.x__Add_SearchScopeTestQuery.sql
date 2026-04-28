-- =============================================================================
-- Migration: SearchScopeTestQuery (RAG+ Phase 4.4)
-- Version:   v5.30.x
-- Plan:      RAG_plan.md §3 Phase 4.4, ~/.claude/plans/make-a-plan-for-buzzing-sky.md
-- =============================================================================
-- Per-scope canonical test queries for offline tuning. Lets a scope author
-- save a small set of representative queries and re-run them after a config
-- change (reranker swap, weight adjustment, scope-template edit) to compare
-- before/after.
--
-- Notes:
--   - No __mj_* timestamp columns, no manual FK indexes (CodeGen owns)
--   - No seed data (admins author rows through the SearchScope form)
-- =============================================================================

CREATE TABLE ${flyway:defaultSchema}.SearchScopeTestQuery (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SearchScopeID UNIQUEIDENTIFIER NOT NULL,
    Label NVARCHAR(200) NOT NULL,
    Query NVARCHAR(MAX) NOT NULL,
    ExpectedTopResultEntity NVARCHAR(255) NULL,
    ExpectedTopResultRecordID UNIQUEIDENTIFIER NULL,
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_SearchScopeTestQuery PRIMARY KEY (ID),
    CONSTRAINT FK_SearchScopeTestQuery_SearchScope FOREIGN KEY (SearchScopeID)
        REFERENCES ${flyway:defaultSchema}.SearchScope(ID)
);
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Canonical test queries owned by a SearchScope. Used by scope authors to validate tuning changes — re-run a saved query after swapping the reranker or adjusting fusion weights and compare results to the prior run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The SearchScope this test query belongs to. Cascade-restricted via FK so accidental scope deletion preserves test history.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'SearchScopeID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short human-readable label for the test query, shown in the form''s test-query grid (e.g. "VIP customer escalation", "expense reimbursement policy").',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'Label';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The query text itself. NVARCHAR(MAX) because canonical queries can be full sentences or chunks of natural-language context.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'Query';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional MJ entity name (e.g. "Contacts", "Documents") of the expected top result. When set together with ExpectedTopResultRecordID, lets the test runner assert that the tuned scope returns the right record at rank #1 — a regression tripwire for fusion / reranker changes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'ExpectedTopResultEntity';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional record ID of the expected top result, paired with ExpectedTopResultEntity. NULL = no assertion (the query is exploratory).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'ExpectedTopResultRecordID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form notes explaining why this query is canonical or what edge case it represents.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'Notes';
GO
