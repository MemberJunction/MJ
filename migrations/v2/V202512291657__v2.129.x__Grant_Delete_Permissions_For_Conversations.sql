-- ============================================================================
-- Grant Delete Permissions for Conversation Messages and Artifacts
-- Migration: v2.129.x
-- Date: 2025-12-29
-- ============================================================================
-- This migration grants Delete permissions to UI and Developer roles for:
--   - Conversation Details (messages)
--   - MJ: Conversation Detail Artifacts (junction table)
--   - MJ: Artifact Versions (for deleting artifact versions from viewer)
--
-- Context:
--   Previously, only the Integration role had CanDelete=1 for these entities.
--   This update enables conversation owners to delete their own messages
--   and artifact versions through the UI.
-- ============================================================================

SET NOCOUNT ON;

PRINT '=== Granting Delete Permissions for Conversation Entities ===';

-- Update Conversation Details permissions for UI and Developer roles
-- EntityID: 12248f34-2837-ef11-86d4-6045bdee16e6 (Conversation Details)
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET CanDelete = 1
WHERE EntityID = '12248f34-2837-ef11-86d4-6045bdee16e6'
  AND RoleID IN (
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',  -- UI role
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'   -- Developer role
  );

PRINT '+ Granted Delete to UI/Developer for Conversation Details';

-- Update MJ: Conversation Detail Artifacts permissions for UI and Developer roles
-- EntityID: 16ab21d1-8047-41b9-8aea-cd253ded9743 (MJ: Conversation Detail Artifacts)
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET CanDelete = 1
WHERE EntityID = '16ab21d1-8047-41b9-8aea-cd253ded9743'
  AND RoleID IN (
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',  -- UI role
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'   -- Developer role
  );

PRINT '+ Granted Delete to UI/Developer for MJ: Conversation Detail Artifacts';

-- Update MJ: Artifact Versions permissions for UI and Developer roles
-- EntityID: aeb408d2-162a-49ae-9dc2-dbe9a21a3c01 (MJ: Artifact Versions)
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET CanDelete = 1
WHERE EntityID = 'aeb408d2-162a-49ae-9dc2-dbe9a21a3c01'
  AND RoleID IN (
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',  -- UI role
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'   -- Developer role
  );

PRINT '+ Granted Delete to UI/Developer for MJ: Artifact Versions';

PRINT '=== Delete Permissions Migration Complete ===';
