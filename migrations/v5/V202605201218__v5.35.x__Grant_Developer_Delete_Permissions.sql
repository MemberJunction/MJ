-- Grant CanDelete to the Developer role on entities where it currently lacks it.
--
-- Context: CodeGen's default EntityPermission for the Developer role is
-- {Read:1, Create:1, Update:1, Delete:0}. The original "core" wave of entities
-- had Delete turned on manually long ago, but every entity added since has been
-- stuck on the default. As of this migration, Developer has Create+Update on
-- 311 entities but Delete on only 77 of them.
--
-- This migration grants Delete on every entity Developer can already create and
-- update, EXCEPT the categories below, which should remain locked:
--   - Audit / log entities (immutable history)
--   - System cache / runtime state
--   - OAuth security-sensitive runtime tables
--   - Global system configuration
--   - End-user-owned content (notifications, settings, saved searches)
--
-- Developer Role ID: DEAFCCEC-6A37-EF11-86D4-000D3A4E707E

UPDATE ep
SET CanDelete = 1
FROM ${flyway:defaultSchema}.EntityPermission ep
INNER JOIN ${flyway:defaultSchema}.Entity e ON ep.EntityID = e.ID
WHERE ep.RoleID = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'
  AND ep.CanDelete = 0
  AND e.AllowDeleteAPI = 1
  AND e.Name NOT IN (
      -- Audit / log entities
      'MJ: Action Execution Logs',
      'MJ: API Key Usage Logs',
      'MJ: Communication Logs',
      'MJ: MCP Tool Execution Logs',
      'MJ: Record Changes',
      'MJ: Record Change Replay Runs',
      'MJ: Search Execution Logs',
      'MJ: Tag Audit Logs',
      -- System cache / runtime state
      'MJ: AI Result Cache',
      -- OAuth security-sensitive runtime
      'MJ: O Auth Tokens',
      'MJ: O Auth Authorization States',
      'MJ: O Auth Client Registrations',
      'MJ: O Auth Auth Server Metadata Caches',
      -- Global system configuration
      'MJ: Environments',
      'MJ: Instance Configurations',
      -- End-user-owned content
      'MJ: User Notifications',
      'MJ: User Notification Preferences',
      'MJ: User Settings',
      'MJ: Knowledge Hub Saved Searches'
  );
