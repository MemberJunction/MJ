-- Backfill six missing CodeGen-convention foreign key indexes
-- (IDX_AUTO_MJ_FKEY_{Table}_{Column})
--
-- DETECTED BY: check MC4 ("every FK column has its IDX_AUTO_MJ_FKEY index")
-- in the `metadata-consistency` integration bundle. Independently confirmed
-- against sys.indexes — the indexes are absent, not renamed. TemplateCategory
-- and TemplateContent each carry ONLY their primary key index; they have zero
-- FK indexes at all.
--
-- MISSING INDEXES
--   CompanyIntegrationRun.ScheduledJobRunID
--   CompanyIntegration.ScheduledJobID
--   TemplateCategory.ParentID
--   TemplateCategory.UserID
--   TemplateContent.TemplateID
--   TemplateContent.TypeID
--
-- TWO ROOT CAUSES
--   1. The ScheduledJob* columns are newer additions whose index DDL was never
--      emitted into an executed migration.
--   2. TemplateCategory / TemplateContent predate the IDX_AUTO_MJ_FKEY
--      convention entirely and were never backfilled when it was introduced.
--
--   Both share the same mechanism: CodeGen *does* generate the correct index
--   DDL for all six on every run (see the checked-in per-table
--   `<Table>.index.generated.sql` files under the generated SQL Scripts
--   folder, which already contain these exact statements), but the DDL is only executed /
--   appended to a migration for entities present in
--   ManageMetadataBase.newEntityList or modifiedEntityList for that run. These
--   entities were unchanged at the time, so the generated SQL was written to
--   disk and then skipped — and is re-skipped on every subsequent run, since
--   the file never changes. There is no idempotent sweep that reconciles index
--   DDL for unchanged entities, so the gap is self-perpetuating and requires
--   this one-time backfill.
--
-- IMPACT: performance only. FK joins and filters on these columns scan instead
-- of seeking. No schema semantics change.
--
-- NAMING: index names below match CodeGen's naming convention EXACTLY
-- (IDX_AUTO_MJ_FKEY_{BaseTableCodeName}_{ColumnCodeName}) so that (a) MC4's
-- assertion on the exact name passes, and (b) a future CodeGen run recognizes
-- them as already-present and does not attempt to recreate them.
--
-- IDEMPOTENT: every CREATE INDEX is guarded by a sys.indexes existence check,
-- mirroring CodeGen's own generated guard. Safe to re-run.

-- CompanyIntegrationRun.ScheduledJobRunID
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_ScheduledJobRunID'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.CompanyIntegrationRun')
)
    CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_ScheduledJobRunID
        ON ${flyway:defaultSchema}.CompanyIntegrationRun ([ScheduledJobRunID]);
GO

-- CompanyIntegration.ScheduledJobID
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_ScheduledJobID'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.CompanyIntegration')
)
    CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_ScheduledJobID
        ON ${flyway:defaultSchema}.CompanyIntegration ([ScheduledJobID]);
GO

-- TemplateCategory.ParentID (self-referencing FK)
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TemplateCategory_ParentID'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.TemplateCategory')
)
    CREATE INDEX IDX_AUTO_MJ_FKEY_TemplateCategory_ParentID
        ON ${flyway:defaultSchema}.TemplateCategory ([ParentID]);
GO

-- TemplateCategory.UserID
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TemplateCategory_UserID'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.TemplateCategory')
)
    CREATE INDEX IDX_AUTO_MJ_FKEY_TemplateCategory_UserID
        ON ${flyway:defaultSchema}.TemplateCategory ([UserID]);
GO

-- TemplateContent.TemplateID
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TemplateContent_TemplateID'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.TemplateContent')
)
    CREATE INDEX IDX_AUTO_MJ_FKEY_TemplateContent_TemplateID
        ON ${flyway:defaultSchema}.TemplateContent ([TemplateID]);
GO

-- TemplateContent.TypeID
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TemplateContent_TypeID'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.TemplateContent')
)
    CREATE INDEX IDX_AUTO_MJ_FKEY_TemplateContent_TypeID
        ON ${flyway:defaultSchema}.TemplateContent ([TypeID]);
GO
