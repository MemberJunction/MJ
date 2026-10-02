-- The recycle-bin chip resolves every entity's deleted-record count by
-- (EntityID, Type='Delete') ordered by ChangedAt DESC, taking the top 500 and reading back
-- RecordID to count distinct deletions. It is embedded in both standard surfaces —
-- entity-viewer.component and entity-data-grid.component — so this query runs on every
-- record open and every grid render, once per entity. RecordChange has only the
-- single-column auto-FK index on EntityID plus IX_RecordChange_RecordID, so the read seeks
-- EntityID, then sorts every change ever recorded for that entity to satisfy the ORDER BY,
-- and looks up Type and RecordID per row. On an audit table that grows one row per record
-- mutation forever, that sort is paid on every page load.
--
-- Measured on SQL Server at 3.9M RecordChange rows: 47,363 ms. The record page issues its
-- related-entity panels as one batched RunViews call, so a read of that length exceeds the
-- request timeout and fails the entire batch — every tab on the record returns 504, not
-- just the recycle-bin chip. The chip's own catch is empty (recycle-bin-chip.component.ts),
-- so nothing attributes the failure to it and the symptom presents as unrelated panels
-- breaking. With this index the same query returns in 687 ms.
--
-- One composite serves the filter and the sort together and covers RecordID, so there is no
-- key lookup and no sort. Key stays far under the 1700-byte nonclustered cap:
-- 16 + nvarchar(20) + datetimeoffset = 66 bytes.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IDX_RecordChange_Entity_Type_ChangedAt'
      AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
)
BEGIN
    CREATE NONCLUSTERED INDEX [IDX_RecordChange_Entity_Type_ChangedAt]
        ON [${flyway:defaultSchema}].[RecordChange]
            ([EntityID], [Type], [ChangedAt] DESC)
        INCLUDE ([RecordID]);
END
