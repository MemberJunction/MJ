-- ============================================================================
-- Grant UI Role Permissions for User Applications
-- Migration: v2.126.x
-- Date: 2025-12-16
-- ============================================================================
-- This migration grants Create/Update/Delete permissions to the UI role for
-- the User Applications entity, allowing users to manage their own application
-- associations through the UI.
--
-- Changes:
--   - User Applications: Grant Create/Update/Delete to UI role
--
-- Context:
--   Previously, UI role users could only read User Applications records.
--   This update enables users to add, modify, and remove their own application
--   associations, which is a common user-facing operation.
-- ============================================================================

SET NOCOUNT ON;

PRINT '=== Granting UI Role Permissions for User Applications ===';

-- Update permissions for User Applications entity
-- EntityID: ec238f34-2837-ef11-86d4-6045bdee16e6 (User Applications)
-- RoleID: e0afccec-6a37-ef11-86d4-000d3a4e707e (UI role)
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    ID = '112C08C4-A5EF-46BD-BC92-DAF3910B1E26';

PRINT '+ Granted Create/Update/Delete to UI role for User Applications';
