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


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = 'F1CA0001-0000-4000-B000-000000000001'
    ) THEN
        INSERT INTO __mj."RowLevelSecurityFilter"
        ("ID", "Name", "Description", "FilterText", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES (
        'F1CA0001-0000-4000-B000-000000000001',
        'UI: Own Identity Claims',
        'Narrows MJ: Identity Claims reads to claims addressed to, or already redeemed by, the current user. Applied to the UI role''s EntityPermission.ReadRLSFilterID. Matches on NormalizedEmail as well as ClaimedByUserID because ClaimedByUserID is NULL until redemption.',
        '[ClaimedByUserID] = ''{{UserID}}'' OR [NormalizedEmail] = LOWER(LTRIM(RTRIM(''{{UserEmail}}'')))',
        NOW(),
        NOW()
        );
    END IF;
END $$;
