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
 ADD COLUMN IF NOT EXISTS "RowFilterColumns" TEXT NULL,
 ADD COLUMN IF NOT EXISTS "BroadSQL"         TEXT NULL;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."MaterializedResult"."RowFilterColumns" IS 'JSON array of the output column names that the row-filter parameters map to. Populated when ParamMode is RowFilterBroad. The materialization holds all rows broad and these columns are filtered at read time (plan section 6.4). NULL for non-row-filter materializations.';

COMMENT ON COLUMN __mj."MaterializedResult"."BroadSQL" IS 'For a RowFilterBroad materialization, the broad source SELECT that the refresh engine materializes: the source query with its row-filter WHERE predicates removed, so the materialized table holds every row the query could return for any parameter value. NULL for non-parameterized materializations, which use the source query SQL directly.';


-- ===================== Other =====================

/* ============================================================================
   Query Materialization — Phase 2d: Row-Filter Persistence
   v5.43.x

   Companion plan: /plans/query-entity-materialization.md (design, section 6.4 / 9)

   Phase 1 materializes only unparameterized queries. Phase 2 classifies a query
   parameter as a "row filter" when varying its value only changes a literal at a
   clean top-level conjunctive WHERE predicate on a projected column. Such a query
   is materialized BROAD (all rows) and the filter is re-applied at read time.

   This migration adds the two columns that persistence requires:
     - RowFilterColumns : the output columns the row-filter parameters map to.
     - BroadSQL         : the broad source SELECT the refresh engine materializes
                          (the query with its row-filter predicates removed).

   Note (CodeGen handles automatically — intentionally omitted): __mj timestamp
   columns/triggers and FK indexes. EntityField metadata is regenerated from this
   schema by CodeGen.
   ============================================================================ */
