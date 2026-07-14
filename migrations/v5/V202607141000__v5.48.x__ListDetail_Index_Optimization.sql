-- ListDetail index optimization (Lists performance work)
--
-- 1. Adds a composite index on (ListID, RecordID). Every add-to-list path
--    runs a duplicate-check of the form
--        ListID = @ListID AND RecordID IN (...)
--    which previously could only seek on the single-column ListID index and
--    then scan within the list for RecordID matches. The composite index
--    covers the whole predicate. It is also the prerequisite for a future
--    UNIQUE (ListID, RecordID) constraint (deferred until deployments have
--    been dedupe-checked).
--
-- 2. Drops IX_ListDetail_ListID, which is an exact duplicate of the
--    CodeGen-managed IDX_AUTO_MJ_FKEY_ListDetail_ListID (both single-column
--    on ListID) — every insert/delete was maintaining both for no benefit.
--    The CodeGen-managed index is kept because CodeGen would recreate it.

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_ListDetail_ListID'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.ListDetail')
)
BEGIN
    DROP INDEX IX_ListDetail_ListID ON ${flyway:defaultSchema}.ListDetail;
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_ListDetail_ListID_RecordID'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.ListDetail')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_ListDetail_ListID_RecordID
        ON ${flyway:defaultSchema}.ListDetail (ListID, RecordID);
END
