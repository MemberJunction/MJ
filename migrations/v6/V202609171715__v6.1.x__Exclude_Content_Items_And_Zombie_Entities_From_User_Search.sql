-- =============================================================================
-- Migration: Exclude Content Items and Plumbing Zombie Entities from User Search
-- Version: v6.1.x
-- Description:
--   Disables AllowUserSearchAPI and AutoUpdateAllowUserSearchAPI on MJ: Content Items
--   and internal/plumbing entities with no text search fields or ID-only fields,
--   preventing unconstrained LIKE scans and 15% baseline score leaks in search results.
-- =============================================================================

UPDATE e
SET e.AllowUserSearchAPI = 0,
    e.AutoUpdateAllowUserSearchAPI = 0
FROM [${flyway:defaultSchema}].[Entity] e
WHERE e.SchemaName = N'${flyway:defaultSchema}'
  AND e.Name IN (
      N'MJ: Content Items',
      N'MJ: Magic Link Invites',
      N'MJ: Magic Link Invite Allowed Domains',
      N'MJ: Magic Link Invite Allowed Paths',
      N'MJ: Magic Link Invite Applications',
      N'MJ: Magic Link Invite Roles',
      N'MJ: Magic Link Redemptions',
      N'MJ: Materialized Results',
      N'MJ: Materialized Result Queries',
      N'MJ: RSU Pending Works',
      N'MJ: AI Skill Search Scopes',
      N'MJ: Cluster Analysis Clusters',
      N'MJ: Employees'
  );
GO
