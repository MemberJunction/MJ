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
 ADD COLUMN IF NOT EXISTS "KeyColumns" TEXT NULL;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."MaterializedResult"."KeyColumns" IS 'Phase 3: JSON array of the key columns ({name, type}) for a keyed/aggregation materialization — the combined key hashed into the surrogate (the stable match key for incremental refresh / dirty-group recompute). NULL means not keyed, in which case a synthetic IDENTITY/ROW_NUMBER surrogate is used.';


-- ===================== Other =====================

-- Phase 3 (combined-key surrogate hashing): records the key columns of a keyed/aggregation
-- materialization so the refresh can compute a stable hash surrogate (the match key for incremental
-- refresh / dirty-group recompute) instead of a synthetic IDENTITY/ROW_NUMBER row id.
-- NULL = not keyed (Phase 1/2 behavior: synthetic surrogate).
