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

DO $mj$
DECLARE
  v_WorkflowsAppID UUID := 'A715122C-F912-4BF5-B4BB-9B94DFDD2A9E';
BEGIN
  /*
  Retires the Workflows application.
  WHY
  ---
  The Workflows app was a second front door onto Flow agents: its own list of the same rows the AI
  app already lists, plus a create/edit canvas that duplicated the Flow agent editor and — because it
  had no Save path at all — could never turn a draft into anything. Everything it was for now lives
  where the substrate lives: a workflow IS a Flow agent, so it is authored in the AI Agents form
  (which now leads with the flow diagram) or conversationally through the Agent Manager, and every
  automated pathway that invokes it is listed on that same record's Invocations tab.
  Nothing the app owned is lost, because it owned nothing. There is no Workflow table and never was
  (see packages/TaskGraph/src/WorkflowSpecSync.ts) — the app was a view, and the rows it viewed are
  untouched by this migration.
  The `Workflow.Draft` / `Workflow.Save` / `Workflow.Validate` Remote Operations are deliberately
  KEPT. They are the agent- and MCP-facing contract for reconciling a workflow's graph and its
  triggers atomically, and they matter more now that creation is conversational, not less. Only the
  Angular app is retired.
  WHAT THIS DOES
  --------------
  Deletes the Application row and everything that hangs off it. The nav item lives inside the
  application's own `DefaultNavItems` JSON, so it goes with the row; the per-user copies live in
  UserApplication / UserApplicationEntity and are removed explicitly, because a user row pointing at
  a deleted application is what puts a dead tile on someone's home screen.
  Idempotent, and a no-op on a database that never had the app (a clean install built after the
  metadata file was removed).
  */
  IF EXISTS (SELECT 1 FROM __mj."Application" WHERE "ID" = v_WorkflowsAppID) THEN
  RAISE NOTICE '%', 'Retiring the Workflows application...';
  -- Per-user application state first: these carry FKs to Application, and a user row surviving its
  -- application is exactly what renders a tile that navigates nowhere.
  DELETE FROM __mj."UserApplicationEntity"
  WHERE "UserApplicationID" IN (
  SELECT "ID" FROM __mj."UserApplication" WHERE "ApplicationID" = v_WorkflowsAppID
  );
  DELETE FROM __mj."UserApplication" WHERE "ApplicationID" = v_WorkflowsAppID;
  -- The app declared no entities and no settings, but delete defensively: an instance that added
  -- its own would otherwise block the parent delete on a foreign key, and the failure would read
  -- as an unrelated FK error rather than as "someone customised this app".
  DELETE FROM __mj."ApplicationEntity"  WHERE "ApplicationID" = v_WorkflowsAppID;
  DELETE FROM __mj."ApplicationSetting" WHERE "ApplicationID" = v_WorkflowsAppID;
  DELETE FROM __mj."ApplicationRole"    WHERE "ApplicationID" = v_WorkflowsAppID;
  -- The nav item is a property of the row (Application.DefaultNavItems, JSON), so it needs no
  -- separate delete — it goes with its parent.
  DELETE FROM __mj."Application" WHERE "ID" = v_WorkflowsAppID;
  RAISE NOTICE '%', 'Workflows application retired. Flow agents are authored in the AI app.';
  ELSE
  RAISE NOTICE '%', 'Workflows application not present — nothing to retire.';
  END IF;
END $mj$;
