-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
--
-- The schema name is emitted UNQUOTED, so PostgreSQL folds it to lowercase. That is deliberate and
-- self-consistent: everything downstream in a converted migration refers to it unquoted too, so
-- both definition and lookup land on the same folded name.
--
-- DOWNSTREAM NOTE for the build engineer: a PostgreSQL database that was populated by an EARLIER
-- converter — one that emitted a quoted, case-preserved name — already holds that mixed-case
-- schema: for a target named MySchema_Name, the quoted "MySchema_Name". Re-converting against
-- that database creates a SECOND, empty schema myschema_name rather than reusing the existing
-- one, because IF NOT EXISTS compares the folded name and finds no match. The repo's own committed
-- migrations-pg files are unaffected (the only quoted CREATE SCHEMAs there are the four pg_dump
-- baselines, which this path does not produce), so this is an open-app / downstream concern, not
-- one for this repo's Flyway history.
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

-- PG-EMPTY-BY-DESIGN: spRecompileAllViews has no PostgreSQL equivalent.
--
-- The SQL Server migration rewrites spRecompileAllViews so it refreshes views in DEPENDENCY
-- order rather than catalog order — the layered-base-view case, where refreshing an
-- application-owned outer view (`SELECT g.* FROM <inner> g`) against a stale inner re-caches
-- the OLD column list and a newly added column silently never appears.
--
-- Every mechanism that fix is built on is SQL Server-only:
--   * sp_refreshview — PostgreSQL has no equivalent. A view's column list is frozen at CREATE;
--     the only way to pick up a new column is CREATE OR REPLACE VIEW with the full definition,
--     which requires the definition, not a catalog walk.
--   * sys.sql_expression_dependencies — the view-to-view edge set the ordering is derived from.
--
-- So there is nothing here to convert: the procedure cannot exist on PostgreSQL, and re-ordering
-- a refresh that cannot happen is meaningless. This is NOT a conversion gap that was missed.
--
-- The PG ledger already states this and has already acted on it. migrations-pg/v5/
-- R__RefreshMetadata.pg-only.sql lists spRecompileAllViews among the routines it deliberately
-- does NOT call, with the same reasoning ("PG freezes a view's column list at creation and there
-- is no sp_refreshview. That gap is real, is tracked separately, and cannot be closed from this
-- file."). Nothing on the PostgreSQL side invokes the procedure, so its absence breaks no caller.
--
-- The underlying gap — that PostgreSQL has no way to bulk-refresh views after a column is added —
-- is unchanged by this migration and remains tracked separately. It is addressed per-entity, at
-- CodeGen time, by regenerating each affected view rather than by a catalogue-wide sweep.
