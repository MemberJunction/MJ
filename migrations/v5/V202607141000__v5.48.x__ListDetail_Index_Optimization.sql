-- ListDetail index optimization + membership uniqueness (Lists performance work)
--
-- 1. Deduplicates ListDetail: every add path checks for duplicates in the
--    application layer, but nothing at the DB level prevented two concurrent
--    adders from inserting the same (ListID, RecordID) pair. Any existing
--    duplicates are removed here, keeping the OLDEST row per pair
--    (__mj_CreatedAt, then ID as tiebreak) so original membership dates and
--    row identities are preserved.
--
-- 2. Adds a UNIQUE index on (ListID, RecordID). This closes the concurrent-add
--    race permanently AND covers the duplicate-check predicate every add path
--    runs (ListID = @ListID AND RecordID IN (...)), which previously could
--    only seek on the single-column ListID index and then scan within the
--    list. Application layers already surface per-record insert failures
--    (PARTIAL_SUCCESS + error collections), so a race loser now reports a
--    failed row instead of silently creating a duplicate.
--
-- 3. Drops IX_ListDetail_ListID, an exact duplicate of the CodeGen-managed
--    IDX_AUTO_MJ_FKEY_ListDetail_ListID (both single-column on ListID) —
--    every insert/delete was maintaining both for no benefit. The
--    CodeGen-managed index is kept because CodeGen would recreate it.
--
-- Also drops the non-unique composite IX_ListDetail_ListID_RecordID if a
-- pre-release build of this migration created it — the unique index replaces
-- it entirely.

-- 1. Remove duplicate memberships, keeping the oldest row per (ListID, RecordID)
;WITH NumberedDupes AS (
    SELECT ID,
           ROW_NUMBER() OVER (
               PARTITION BY ListID, RecordID
               ORDER BY __mj_CreatedAt ASC, ID ASC
           ) AS RowNum
    FROM ${flyway:defaultSchema}.ListDetail
)
DELETE FROM NumberedDupes WHERE RowNum > 1;

-- 2a. Drop the redundant single-column ListID index
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_ListDetail_ListID'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.ListDetail')
)
BEGIN
    DROP INDEX IX_ListDetail_ListID ON ${flyway:defaultSchema}.ListDetail;
END

-- 2b. Drop the non-unique composite from pre-release builds of this migration
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_ListDetail_ListID_RecordID'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.ListDetail')
)
BEGIN
    DROP INDEX IX_ListDetail_ListID_RecordID ON ${flyway:defaultSchema}.ListDetail;
END

-- 3. Enforce membership uniqueness (and cover the duplicate-check predicate)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_ListDetail_ListID_RecordID'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.ListDetail')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UQ_ListDetail_ListID_RecordID
        ON ${flyway:defaultSchema}.ListDetail (ListID, RecordID);
END
