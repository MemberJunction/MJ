-- PostgreSQL twin of migrations/v5/V202606130000__v5.41.x__Integration_RecordMap_Identity_Index.sql
-- The dedup/upsert lookup index the sync engine keys CREATE-vs-UPDATE on
-- (MatchEngine.FindRecordMapEntry / IntegrationEngine upsert). Deliberately NON-UNIQUE (matches SS):
-- it buys the index speedup with zero risk of failing on a populated DB that may legitimately hold
-- multiple rows for the same external identity. PG `CREATE INDEX IF NOT EXISTS` is idempotent.
CREATE INDEX IF NOT EXISTS "IDX_CompanyIntegrationRecordMap_Identity"
    ON __mj."CompanyIntegrationRecordMap" ("CompanyIntegrationID", "EntityID", "ExternalSystemRecordID");
