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

UPDATE __mj."EntityPermission"
SET "CanCreate" = TRUE,
    "CanUpdate" = TRUE
WHERE "EntityID" = '2861DD69-94B4-475D-B3ED-F9663A25C58B'
  AND "RoleID"   = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
  AND ("CanCreate" = FALSE OR "CanUpdate" = FALSE);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM __mj."EntityPermission"
        WHERE "EntityID" = '2861DD69-94B4-475D-B3ED-F9663A25C58B'
        AND "RoleID"   = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
    ) THEN
        INSERT INTO __mj."EntityPermission" (
        "ID", "EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete"
        ) VALUES (
        gen_random_uuid(),
        '2861DD69-94B4-475D-B3ED-F9663A25C58B',
        'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
        TRUE, TRUE, TRUE, FALSE
        );
    END IF;
END $$;


-- ===================== Other =====================

-- Grant the UI role Create + Update permissions on MJ: User Settings.
--
-- Context: the baseline EntityPermission seed gives UI {Read:1, Create:0,
-- Update:0, Delete:0} on MJ: User Settings — read-only. But __mj."UserSetting"
-- exists specifically to let users persist their *own* preferences (default
-- views, dismissed prompts, consent acknowledgements, etc.), and the
-- UNIQUE (UserID, Setting) constraint guarantees a row can only belong to
-- the user who created it. With read-only access, UserInfoEngine."SetSetting"
-- silently fails for any UI-role user, which surfaces as bugs like:
--   • the Agent Feedback consent dialog re-prompting on every rating
--   • per-user default views not sticking across sessions
--
-- This migration flips Create + Update to 1 for the UI role on MJ: User
-- Settings only. Delete stays 0 (no need for users to delete their own
-- settings rows; the upsert pattern handles changes). Idempotent — re-runs
-- are no-ops because the UPDATE only touches rows where the flags are still
-- 0, and the safety INSERT only fires if no row exists at all.
--
-- UI Role ID:                  E0AFCCEC-6A37-EF11-86D4-000D3A4E707E
-- MJ: User Settings Entity ID: 2861DD69-94B4-475D-B3ED-F9663A25C58B

-- Safety: in the unusual case where the baseline row was never inserted (e.g.
-- a partial baseline run), insert one with the intended grants. NewID() keeps
-- the migration self-contained for any environment without colliding on PK.
