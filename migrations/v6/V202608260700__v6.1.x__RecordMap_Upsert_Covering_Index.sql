-- The integration engine resolves every external record's map row by
-- (CompanyIntegrationID, EntityID, ExternalSystemRecordID) and reads back EntityRecordID to decide
-- whether anything changed: SaveRecordMap's upsert lookup, RecordMapBatch.readExisting's chunk read,
-- and LoadAllRecordMaps' orphan-sweep paging all filter on this prefix. The table has only the two
-- single-column auto-FK indexes, so each of those reads picks one FK index and looks up the rest —
-- on a map table with one row per synced record ever seen, that lookup is paid per record per sync.
-- One covering composite serves all three access paths with no key lookup.
-- Key stays under the 1700-byte nonclustered cap: 16 + 16 + nvarchar(750) = 1532 bytes.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IDX_CompanyIntegrationRecordMap_Identity_Covering'
      AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRecordMap]')
)
BEGIN
    CREATE NONCLUSTERED INDEX [IDX_CompanyIntegrationRecordMap_Identity_Covering]
        ON [${flyway:defaultSchema}].[CompanyIntegrationRecordMap]
            ([CompanyIntegrationID], [EntityID], [ExternalSystemRecordID])
        INCLUDE ([EntityRecordID]);
END
