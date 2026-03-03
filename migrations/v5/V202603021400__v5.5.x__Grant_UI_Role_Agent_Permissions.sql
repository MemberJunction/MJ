-- ============================================================================
-- Grant UI Role Create/Update Permissions for Agent & Conversation Entities
-- Migration: v5.5.x
-- Date: 2026-03-02
-- ============================================================================
-- Problem: End users assigned the "UI" role cannot use agents (e.g. Sage)
-- because they lack Create permission on AI Agent Runs and related entities.
-- Error: "Does NOT have permission to Create MJ: AI Agent Runs records."
--
-- Fix: Two layers must be updated to stay in sync:
--   1. EntityPermission rows (application-layer check in BaseEntity.Save)
--   2. GRANT EXECUTE on stored procedures (SQL-layer security for cdp_UI role)
--
-- Closes: https://github.com/MemberJunction/MJ/issues/2048
-- ============================================================================

SET NOCOUNT ON;

DECLARE @UIRoleID UNIQUEIDENTIFIER;
SELECT @UIRoleID = ID FROM [${flyway:defaultSchema}].[Role] WHERE [SQLName] = 'cdp_UI';

IF @UIRoleID IS NULL
BEGIN
    RAISERROR('UI role (cdp_UI) not found - cannot apply permission migration.', 16, 1);
    RETURN;
END

-- Grant Create + Update for all affected entities
UPDATE ep
SET ep.CanCreate = 1, ep.CanUpdate = 1
FROM [${flyway:defaultSchema}].[EntityPermission] ep
INNER JOIN [${flyway:defaultSchema}].[Entity] e ON ep.EntityID = e.ID
WHERE ep.RoleID = @UIRoleID
  AND e.Name IN (
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
