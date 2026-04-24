-- =====================================================================================================================
-- Migration: Grant UI role the permissions it needs to share dashboards,
--            revoke its own shares, and run AI chat flows. Apply read-time RLS
--            to AI run entities so UI users only see their own runs.
-- Version: 5.29.x
-- Description:
--   Three related issues with the UI role ("cdp_UI") are fixed here:
--
--   1. **Sharing dashboards** — UI users hitting the share dialog got
--      `Does NOT have permission to Create MJ: Dashboard Permissions records`.
--      An earlier migration (V202603021401 / v5.6.x) granted Create/Update on
--      the conversation + agent-run entities, but not on the four sharing-permission
--      entities. This migration closes those gaps. Server-side ownership gates in
--      `MJDashboardPermissionEntityExtended`, `MJArtifactPermissionEntityExtended`,
--      and `MJCollectionPermissionEntityExtended` prevent UI users from creating
--      permissions on resources they don't own — role-level Create is gated by
--      ownership in the extended class's `Save()`, matching the pre-existing
--      `MJResourcePermissionEntityExtended.callerMayGrantShare` pattern.
--
--   2. **Sending chat messages** — triggering an agent creates `MJ: AI Prompt Runs`.
--      v5.6.x granted UI users Create/Update on `MJ: AI Agent Runs` and related,
--      but NOT on `MJ: AI Prompt Runs`. Also covers artifact-version entities
--      reachable from agent runs that produce versioned outputs.
--
--   3. **AI run privacy (RLS)** — the Create grants above would otherwise let
--      every UI user read every other UI user's AI runs (no RLS on those entities).
--      This migration adds three `RowLevelSecurityFilter` records that narrow
--      UI reads to "runs the user owns": direct `UserID` match on AIAgentRun,
--      subquery join via AgentRunID for AIAgentRunStep and AIPromptRun.
--      Developer and Integration roles are unchanged — they see all runs.
--
--   The EntityPermission updates are idempotent (match on EntityID+RoleID) so
--   re-running the migration is a no-op. CodeGen will regenerate the
--   `spCreate/spUpdate/spDelete*` stored procedure GRANTs to include `cdp_UI`
--   on the next run — a GRANT-only change doesn't need schema DDL here.
-- =====================================================================================================================

SET NOCOUNT ON;

DECLARE @UIRoleID UNIQUEIDENTIFIER;
SELECT @UIRoleID = ID FROM [${flyway:defaultSchema}].[Role] WHERE [SQLName] = 'cdp_UI';

IF @UIRoleID IS NULL
BEGIN
    RAISERROR('UI role (cdp_UI) not found - cannot apply permission migration.', 16, 1);
    RETURN;
END

-- ------------------------------------------------------------------------------
-- 1) Sharing entities — allow UI users to share and revoke their own grants.
--    Extended entity classes enforce grantor/owner gating on Create and
--    Update/Delete, so granting at the role level doesn't expose the ability
--    to manage shares the user didn't create or doesn't own.
-- ------------------------------------------------------------------------------

-- MJ: Dashboard Permissions — was C=0,R=1,U=0,D=0 → full CRUD
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1, CanDelete = 1
WHERE EntityID = '771ed81a-b504-4027-b223-ca3abbaa3c75'
  AND RoleID   = @UIRoleID;

-- MJ: Resource Permissions — was C=0,R=1,U=0,D=0 → full CRUD
-- (`MJResourcePermissionEntityExtended.Save()` already gates Create via
-- `callerMayGrantShare`, so the role-level grant is safe.)
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1, CanDelete = 1
WHERE EntityID = '201852e1-4587-ef11-8473-6045bdf077ee'
  AND RoleID   = @UIRoleID;

-- MJ: Artifact Permissions — was C=1,R=1,U=1,D=0 → add Delete
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanDelete = 1
WHERE EntityID = '19846e1a-fd8e-405f-a0fa-42a7aa44758d'
  AND RoleID   = @UIRoleID;

-- MJ: Collection Permissions — was C=1,R=1,U=1,D=0 → add Delete
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanDelete = 1
WHERE EntityID = '55e5a944-6ecd-491d-a4e9-99e1453febdb'
  AND RoleID   = @UIRoleID;

-- ------------------------------------------------------------------------------
-- 2) AI Prompt Runs + related artifact-write entities not covered by v5.6.x.
--    (v5.6.x already covers AIAgentRuns, AIAgentRunSteps, AIAgentRunMedias,
--    and the conversation-artifact family — those stay idempotent no-ops here.)
-- ------------------------------------------------------------------------------

-- MJ: AI Prompt Runs — was C=0,R=1,U=0,D=0 → add Create + Update
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1
WHERE EntityID = '7c1c98d0-3978-4ce8-8e3f-c90301e59767'
  AND RoleID   = @UIRoleID;

-- MJ: Artifact Versions — was C=0,R=1,U=0,D=0 → add Create + Update
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1
WHERE EntityID = 'aeb408d2-162a-49ae-9dc2-dbe9a21a3c01'
  AND RoleID   = @UIRoleID;

-- MJ: Artifact Version Attributes — was C=0,R=1,U=0,D=0 → add Create + Update
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1
WHERE EntityID = '5d4bc8d7-ab3f-444e-b85a-fc89297887b2'
  AND RoleID   = @UIRoleID;

-- ------------------------------------------------------------------------------
-- 3) Row-Level Security — UI users only see their own AI runs.
--    `{{UserID}}` is the runtime template token MarkupFilterText resolves
--    from `UserInfo.ID`. Base table references are unqualified because the
--    filter text is concatenated into the existing view WHERE clause, which
--    already runs under the correct default schema.
-- ------------------------------------------------------------------------------

-- Three RLS filters. Inserted with MERGE so the migration is idempotent (no
-- duplicate-key error on re-run) without needing to pre-check existence.

DECLARE @FilterAgentRunsID     UNIQUEIDENTIFIER = 'E1AF0001-0000-4000-B000-000000000001';
DECLARE @FilterAgentStepsID    UNIQUEIDENTIFIER = 'E1AF0002-0000-4000-B000-000000000002';
DECLARE @FilterPromptRunsID    UNIQUEIDENTIFIER = 'E1AF0003-0000-4000-B000-000000000003';

MERGE ${flyway:defaultSchema}.RowLevelSecurityFilter AS tgt
USING (VALUES
    (@FilterAgentRunsID, N'UI: Own AI Agent Runs',
        N'Narrows MJ: AI Agent Runs reads to runs owned by the current user. Applied to the UI role''s EntityPermission.ReadRLSFilterID.',
        N'UserID = ''{{UserID}}'''),
    (@FilterAgentStepsID, N'UI: Own AI Agent Run Steps',
        N'Narrows MJ: AI Agent Run Steps reads to steps of agent runs owned by the current user.',
        N'AgentRunID IN (SELECT ID FROM AIAgentRun WHERE UserID = ''{{UserID}}'')'),
    (@FilterPromptRunsID, N'UI: Own AI Prompt Runs',
        N'Narrows MJ: AI Prompt Runs reads to prompt runs whose parent agent run is owned by the current user. Standalone prompt runs (AgentRunID IS NULL) are not visible to UI users — they''re typically admin/system triggered.',
        N'AgentRunID IN (SELECT ID FROM AIAgentRun WHERE UserID = ''{{UserID}}'')')
) AS src (ID, Name, Description, FilterText)
ON tgt.ID = src.ID
WHEN MATCHED THEN UPDATE
    SET Name = src.Name, Description = src.Description, FilterText = src.FilterText
WHEN NOT MATCHED THEN INSERT (ID, Name, Description, FilterText)
    VALUES (src.ID, src.Name, src.Description, src.FilterText);

-- Apply each filter to the UI role's EntityPermission (ReadRLSFilterID).
-- Other roles (Developer, Integration) are untouched and continue to read all rows.

UPDATE ${flyway:defaultSchema}.EntityPermission
SET ReadRLSFilterID = @FilterAgentRunsID
WHERE EntityID = '5190af93-4c39-4429-bdaa-0aeb492a0256'   -- MJ: AI Agent Runs
  AND RoleID   = @UIRoleID;

UPDATE ${flyway:defaultSchema}.EntityPermission
SET ReadRLSFilterID = @FilterAgentStepsID
WHERE EntityID = '99273dad-560e-4abc-8332-c97ab58b7463'   -- MJ: AI Agent Run Steps
  AND RoleID   = @UIRoleID;

UPDATE ${flyway:defaultSchema}.EntityPermission
SET ReadRLSFilterID = @FilterPromptRunsID
WHERE EntityID = '7c1c98d0-3978-4ce8-8e3f-c90301e59767'   -- MJ: AI Prompt Runs
  AND RoleID   = @UIRoleID;
