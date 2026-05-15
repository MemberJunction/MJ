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


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

UPDATE __mj."EntityField"
SET "UserSearchPredicateAPI" = 'Contains'
WHERE "UserSearchPredicateAPI" IS NULL
   OR "UserSearchPredicateAPI" NOT IN ('BeginsWith', 'Contains', 'EndsWith', 'Exact');

-- 2. Add the CHECK constraint. WITH CHECK validates existing rows immediately;
--    the UPDATE above guarantees they all comply. Trusted constraints help the
--    SQL Server query optimizer eliminate impossible branches.


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'CK_EntityField_UserSearchPredicateAPI'
          AND conrelid = '__mj."EntityField"'::regclass
    ) THEN
        ALTER TABLE __mj."EntityField"
        ADD CONSTRAINT "CK_EntityField_UserSearchPredicateAPI"
        CHECK ("UserSearchPredicateAPI" IN ('BeginsWith', 'Contains', 'EndsWith', 'Exact'));
    END IF;
END $$;
