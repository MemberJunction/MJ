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

-- Implicit INTEGER -> BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER->bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
DECLARE
  v_UIRoleID UUID;
BEGIN
  -- ============================================================================
  -- Grant UI Role Create/Update Permissions for Agent & Conversation Entities
  -- Migration: v5.6.x
  -- Date: 2026-03-02
  -- ============================================================================
  -- Problem: End users assigned the "UI" role cannot use agents (e.g. Sage)
  -- because they lack Create permission on AI Agent Runs and related entities.
  -- Error: "Does NOT have permission to Create MJ: AI Agent Runs records."
  --
  -- Fix: Two layers must be updated to stay in sync:
  --   1. EntityPermission rows (application-layer check in BaseEntity."Save")
  --   2. GRANT EXECUTE on stored procedures (SQL-layer security for cdp_UI role)
  --
  -- Closes: https://github.com/MemberJunction/MJ/issues/2048
  -- ============================================================================
  SELECT "ID" INTO v_UIRoleID FROM __mj."Role" WHERE "SQLName" = 'cdp_UI';
  IF v_UIRoleID IS NULL THEN
  RAISE EXCEPTION 'UI role (cdp_UI) not found - cannot apply permission migration.';
  RETURN;
  END IF;
  -- Grant Create + Update for all affected entities
  UPDATE __mj."EntityPermission" SET "CanCreate" = 1, "CanUpdate" = 1
  FROM __mj."Entity" e
  WHERE __mj."EntityPermission"."EntityID" = e."ID"
  AND __mj."EntityPermission"."RoleID" = v_UIRoleID
  AND e."Name" IN (
  'MJ: AI Agent Runs',
  'MJ: AI Agent Run Steps',
  'MJ: AI Agent Run Medias',
  'MJ: Conversation Artifacts',
  'MJ: Conversation Artifact Versions',
  'MJ: Conversation Artifact Permissions',
  'MJ: Conversation Detail Artifacts',
  'MJ: Conversation Detail Attachments',
  'MJ: Conversation Detail Ratings'
  );
END $$;
