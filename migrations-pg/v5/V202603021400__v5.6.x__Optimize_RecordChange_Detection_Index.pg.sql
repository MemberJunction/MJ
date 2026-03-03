-- Optimize external change detection performance for PostgreSQL
-- This index speeds up the MAX(ChangedAt) lookups used to detect updates
CREATE INDEX "IX_RecordChange_Detection_Optimized" 
ON "${flyway:defaultSchema}"."RecordChange" ("EntityID", "RecordID", "Type", "ChangedAt");
