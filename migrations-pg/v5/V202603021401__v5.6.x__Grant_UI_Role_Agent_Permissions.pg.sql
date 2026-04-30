
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
  UPDATE __mj."EntityPermission" SET "CanCreate" = TRUE, "CanUpdate" = TRUE
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
