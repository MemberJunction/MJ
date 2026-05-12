-- ============================================================================
-- Cleanup: AIPrompt.FailoverStrategy CHECK constraint
--
-- Per AN-BC's round-1 review on PR #2471 (the ModelResolver extraction):
-- the existing CK_AIPrompt_FailoverStrategy declared the four allowed values
-- plus an `OR FailoverStrategy IS NULL` clause. Per
-- migrations/CLAUDE.md §6 ("CHECK Constraint Guidelines") that pattern
-- breaks the MJ CodeGen CHECK-constraint parser, which then emits each
-- enum literal twice. Visible in the generated TypeScript today:
--
--   get FailoverStrategy(): 'NextBestModel' | 'NextBestModel' | 'None' | 'None'
--                         | 'PowerRank' | 'PowerRank'
--                         | 'SameModelDifferentVendor' | 'SameModelDifferentVendor'
--
-- The `IS NULL` clause is also redundant: AIPrompt.FailoverStrategy is
-- NOT NULL with a `'SameModelDifferentVendor'` default, so NULL is never
-- representable in the column.
--
-- This migration:
--   1. Defensively drops EVERY CHECK constraint currently bound to the
--      AIPrompt.FailoverStrategy column (handles deployments where the
--      constraint may have ended up under a different system-generated
--      name, e.g. CK__AIPrompt__Failov__XXXX from an inline CHECK).
--   2. Adds a single canonical CK constraint using the simple IN (...)
--      form CodeGen's parser handles cleanly.
--
-- Pair with: PR #2471 Phase 1 — `ModelResolver` extraction. The resolver's
-- `WithFailover` switches on `MJAIPromptEntity.FailoverStrategy`, and the
-- discriminated-union typing is much cleaner for reviewers when each
-- literal isn't duplicated. See PHASE_1_MODEL_RESOLVER_SPEC.md §6
-- ("Phase 1.5 housekeeping bundled with this rollout").
-- ============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 1. Drop ALL existing CHECK constraints on AIPrompt.FailoverStrategy.
--    Built dynamically because earlier installs may have ended up with the
--    constraint under a different name (e.g. system-generated CK__... if the
--    original column was created with an inline check rather than ALTER TABLE
--    ADD CONSTRAINT).
DECLARE @dropSql NVARCHAR(MAX) = N'';

SELECT @dropSql = @dropSql + N'ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] DROP CONSTRAINT [' + cc.name + N'];' + CHAR(13) + CHAR(10)
FROM sys.check_constraints cc
INNER JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
INNER JOIN sys.tables t ON t.object_id = cc.parent_object_id
INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE s.name = '${flyway:defaultSchema}'
  AND t.name = 'AIPrompt'
  AND c.name = 'FailoverStrategy';

IF LEN(@dropSql) > 0
BEGIN
    EXEC sp_executesql @dropSql;
END

-- 2. Re-add the single canonical CHECK constraint using the simple IN (...)
--    form. No `OR ... IS NULL` clause: the column is NOT NULL with a default
--    of 'SameModelDifferentVendor', so NULL is never representable, and the
--    redundant clause breaks CodeGen's parser.
ALTER TABLE [${flyway:defaultSchema}].[AIPrompt] WITH CHECK
ADD CONSTRAINT [CK_AIPrompt_FailoverStrategy]
CHECK ([FailoverStrategy] IN (N'None', N'SameModelDifferentVendor', N'NextBestModel', N'PowerRank'));

-- 3. Dedupe EntityFieldValue rows for FailoverStrategy.
--
--    The v5 baseline shipped with every enum value duplicated for the
--    AIPrompt.FailoverStrategy field in `EntityFieldValue` — eight rows
--    where four were expected (sequences 1,1,2,2,3,3,4,4). CodeGen
--    materializes the TS union from this table, not from sys.check_constraints
--    directly, so the duplication shows up in the generated entity_subclasses.ts.
--    Look up the EntityField by entity-name + field-name (rather than
--    hard-coding EntityField.ID) so the cleanup is robust across installs.
--    The follow-on CodeGen output appended below re-INSERTs the canonical
--    four rows.
DECLARE @failoverFieldId UNIQUEIDENTIFIER;
SELECT @failoverFieldId = ef.ID
FROM [${flyway:defaultSchema}].[EntityField] ef
INNER JOIN [${flyway:defaultSchema}].[Entity] e ON e.ID = ef.EntityID
WHERE e.Name = N'MJ: AI Prompts' AND ef.Name = N'FailoverStrategy';

IF @failoverFieldId IS NOT NULL
BEGIN
    DELETE FROM [${flyway:defaultSchema}].[EntityFieldValue]
    WHERE EntityFieldID = @failoverFieldId;
END

COMMIT TRANSACTION;





-- ============================================================================
-- CodeGen output (mechanical append — do not edit by hand).
-- ============================================================================

/* SQL text to insert entity field value with ID 07c3422e-b14d-44db-aa5c-a208862946e1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('07c3422e-b14d-44db-aa5c-a208862946e1', 'F9C62D4B-92AB-45B3-B870-F3060054493E', 1, 'NextBestModel', 'NextBestModel', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 7b018800-730c-45ff-b985-7a1029e9c727 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7b018800-730c-45ff-b985-7a1029e9c727', 'F9C62D4B-92AB-45B3-B870-F3060054493E', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 180cc384-27d7-4c91-bdaa-d06ccf6483d6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('180cc384-27d7-4c91-bdaa-d06ccf6483d6', 'F9C62D4B-92AB-45B3-B870-F3060054493E', 3, 'PowerRank', 'PowerRank', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 2f81abb4-9a57-4832-bb7d-91a882f8854f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2f81abb4-9a57-4832-bb7d-91a882f8854f', 'F9C62D4B-92AB-45B3-B870-F3060054493E', 4, 'SameModelDifferentVendor', 'SameModelDifferentVendor', GETUTCDATE(), GETUTCDATE())

