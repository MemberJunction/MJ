-- Integration record-map identity index (PR #2752 leftover C2).
--
-- The triple (CompanyIntegrationID, EntityID, ExternalSystemRecordID) is the external↔MJ identity the
-- engine keys CREATE-vs-UPDATE on (MatchEngine.FindRecordMapEntry / IntegrationEngine upsert). It is
-- looked up once per incoming record, every sync. Today only the two single-column FK indexes exist,
-- so that 3-column lookup is an unindexed scan — fine at small volume, slow once the ledger is large.
--
-- This adds a NON-UNIQUE composite index covering the lookup, turning the scan into a seek. Chosen
-- non-unique deliberately: it gets the speedup with ZERO risk of failing on a populated DB that might
-- already hold a duplicate map from a past bug, and never blocks a sync. The one-external ↔ one-MJ
-- invariant is still enforced in app code (IntegrationEngine's upsert-by-identity). A UNIQUE variant
-- (DB-level race protection) can be substituted later once existing data is confirmed dupe-free.
--
-- Key size is safe: 16 (CompanyIntegrationID) + 16 (EntityID) + NVARCHAR(750)=1500 bytes
-- (ExternalSystemRecordID) = 1532 bytes, under SQL Server's 1700-byte nonclustered index-key limit.
--
-- Idempotent: guarded so a re-run is a no-op.

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IDX_CompanyIntegrationRecordMap_Identity'
      AND object_id = OBJECT_ID('${flyway:defaultSchema}.CompanyIntegrationRecordMap')
)
BEGIN
    CREATE NONCLUSTERED INDEX [IDX_CompanyIntegrationRecordMap_Identity]
    ON ${flyway:defaultSchema}.CompanyIntegrationRecordMap
        ([CompanyIntegrationID], [EntityID], [ExternalSystemRecordID]);
END
GO
