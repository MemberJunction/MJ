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

/* SQL text to insert entity field value with ID f3b88f71-a0bd-4b5e-82e5-6d98e3a18f0e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f3b88f71-a0bd-4b5e-82e5-6d98e3a18f0e', 'F9C62D4B-92AB-45B3-B870-F3060054493E', 1, 'NextBestModel', 'NextBestModel', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 46635dbe-7547-4108-a7f6-289ade78720e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('46635dbe-7547-4108-a7f6-289ade78720e', 'F9C62D4B-92AB-45B3-B870-F3060054493E', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 32f96fd7-e4f5-4b12-81db-9c63c35a7f2d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('32f96fd7-e4f5-4b12-81db-9c63c35a7f2d', 'F9C62D4B-92AB-45B3-B870-F3060054493E', 3, 'PowerRank', 'PowerRank', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID d46a9d6b-15c0-48ab-8c9f-8b796afaa998 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d46a9d6b-15c0-48ab-8c9f-8b796afaa998', 'F9C62D4B-92AB-45B3-B870-F3060054493E', 4, 'SameModelDifferentVendor', 'SameModelDifferentVendor', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID bbd0c5bf-d2e7-46fe-bc7c-35e61cfe468a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bbd0c5bf-d2e7-46fe-bc7c-35e61cfe468a', 'A261204E-3866-41B3-92EB-784C74D2F906', 1, 'BeginsWith', 'BeginsWith', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID a72d0eac-dd95-4460-a2eb-3ab9890f4918 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a72d0eac-dd95-4460-a2eb-3ab9890f4918', 'A261204E-3866-41B3-92EB-784C74D2F906', 2, 'Contains', 'Contains', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 4663027e-6f71-4977-9458-64e0d8931665 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4663027e-6f71-4977-9458-64e0d8931665', 'A261204E-3866-41B3-92EB-784C74D2F906', 3, 'EndsWith', 'EndsWith', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 502a761e-ef89-44ad-b725-8b3b4870930c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('502a761e-ef89-44ad-b725-8b3b4870930c', 'A261204E-3866-41B3-92EB-784C74D2F906', 4, 'Exact', 'Exact', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID A261204E-3866-41B3-92EB-784C74D2F906 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A261204E-3866-41B3-92EB-784C74D2F906'

