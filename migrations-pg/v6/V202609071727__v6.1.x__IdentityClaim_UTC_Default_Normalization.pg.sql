-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================
--
-- HAND-PORTED. The AST transpiler reported 12 unhandled statements: four
-- `DECLARE @constraintName/@definition` blocks, four `SELECT @x = … FROM
-- sys.tables JOIN sys.default_constraints …` catalog probes, and four
-- `IF … REPLACE(REPLACE(LOWER(@definition) …` guards. None of that shape exists
-- on PostgreSQL, and none of it needs to.
--
-- WHY THE SQL SERVER VERSION IS SO ELABORATE, AND THIS ONE IS NOT
-- ---------------------------------------------------------------
-- SQL Server implements a column default as a separately NAMED object in
-- sys.default_constraints. To change one you must first find its generated name
-- via the catalog, DROP CONSTRAINT by that name, then ADD a new one — hence the
-- probe, the variables, and the QUOTENAME/EXEC dance, repeated per column.
--
-- PostgreSQL has no named default constraints. A default is an attribute of the
-- column (pg_attrdef), and `ALTER COLUMN … SET DEFAULT` REPLACES whatever is
-- there. So the port is one statement per column, and it is idempotent by
-- construction — which is exactly the property the T-SQL original had to
-- hand-build with its `IF @constraintName IS NULL OR … <> 'getutcdate'` guard.
--
-- THE TARGET VALUE
-- ----------------
-- The SQL Server migration normalizes these four defaults to GETUTCDATE(),
-- "the default CodeGen expects on every MJ table", so CodeGen's text comparison
-- stops dropping and recreating the constraints on every run.
--
-- The PostgreSQL equivalent of that canonical value is `NOW() AT TIME ZONE 'UTC'`.
-- Two independent confirmations:
--   1. PostgreSQLCodeGenProvider.ts:1550/1554 emits the audit columns as
--      `TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')`.
--   2. Its default-normalization map (same file, ~1697) maps 'getutcdate()' →
--      "NOW() AT TIME ZONE 'UTC'" explicitly.
-- Verified against a migrated database: 306 __mj_CreatedAt columns already carry
-- `(now() AT TIME ZONE 'UTC'::text)`, while these four carried a bare `now()` —
-- the same divergence-from-canonical this migration exists to remove, in the
-- PostgreSQL idiom.
--
-- A database already holding the canonical default is unaffected: SET DEFAULT
-- writes the same expression.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;


ALTER TABLE __mj."IdentityClaimType"
    ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

ALTER TABLE __mj."IdentityClaimType"
    ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

ALTER TABLE __mj."IdentityClaim"
    ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

ALTER TABLE __mj."IdentityClaim"
    ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');
