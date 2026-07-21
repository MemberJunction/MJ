-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202607141000__v5.48.x__ListDetail_Index_Optimization
-- Hand-authored PG counterpart of the SQL Server index-optimization migration
-- (dedup ListDetail, drop redundant indexes, enforce (ListID,RecordID) uniqueness).
-- The AST transpiler emitted an invalid CTE-targeted DELETE and left the two
-- DROP INDEX guards as gaps; all four statements are hand-ported here to native PG.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- 1. Remove duplicate memberships, keeping the oldest row per (ListID, RecordID).
--    SQL Server used a CTE-targeted DELETE; PG uses DELETE ... USING a ranked subquery.
DELETE FROM __mj."ListDetail" ld
USING (
    SELECT "ID",
           ROW_NUMBER() OVER (
               PARTITION BY "ListID", "RecordID"
               ORDER BY "__mj_CreatedAt" ASC, "ID" ASC
           ) AS rn
    FROM __mj."ListDetail"
) d
WHERE ld."ID" = d."ID"
  AND d.rn > 1;

-- 2a. Drop the redundant single-column ListID index (the CodeGen-managed
--     IDX_AUTO_MJ_FKEY_ListDetail_ListID FK index remains and covers ListID).
DROP INDEX IF EXISTS __mj."IX_ListDetail_ListID";

-- 2b. Drop the non-unique composite index from any pre-release build of this
--     migration — the unique index below replaces it entirely.
DROP INDEX IF EXISTS __mj."IX_ListDetail_ListID_RecordID";

-- 3. Enforce membership uniqueness (also covers the duplicate-check predicate
--    every add path runs: ListID = @ListID AND RecordID IN (...)).
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ListDetail_ListID_RecordID"
    ON __mj."ListDetail" ("ListID", "RecordID");
