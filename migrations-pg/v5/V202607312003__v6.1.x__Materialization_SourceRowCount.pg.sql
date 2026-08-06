-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== DDL: Tables, PKs, Indexes =====================

ALTER TABLE __mj."MaterializedResult"
 ADD COLUMN IF NOT EXISTS "SourceRowCount" BIGINT NULL;  -- BIGINT (like RowCount): stores source COUNT(*), which can exceed int32.;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."MaterializedResult"."SourceRowCount" IS 'Phase 3 (DirtyGroupRecompute): the SOURCE table row count observed at the last successful refresh. Delete-detection guard — if the current source COUNT(*) is lower than this, rows were deleted and the refresh falls back to a full rebuild (dirty-group recompute cannot localize deletes from surviving rows). NULL means no baseline yet (first run does a full rebuild and sets it). Distinct from RowCount, which counts materialized rows (groups).';


-- ===================== Other =====================

-- Phase 3 (DirtyGroupRecompute): records the SOURCE row count observed at the last successful refresh.
-- Used as the cheap delete-detection guard for incremental dirty-group recompute: if the current source
-- COUNT(*) is LOWER than this value, rows were deleted (a net decrease that dirty-group recompute — which
-- only re-computes groups whose SURVIVING rows changed since Watermark — cannot localize), so the refresh
-- falls back to a full rebuild. NULL = no baseline yet (first run → full rebuild, which sets it).
-- (This is distinct from RowCount, which is the count of MATERIALIZED rows i.e. groups, not source rows.)
