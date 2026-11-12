-- ============================================================================
-- v6.3.x — UI-role users create and manage their own conversation folders (#4816)
--
-- WHY. The UI role holds Read on MJ: Projects, narrowed by "UI: Own or Shared
-- Projects" (V202609260053, widened in V202611021720), and nothing else. Only
-- Developer and Integration can create a folder, and both read unfiltered — so the
-- users the read filter binds cannot make a folder at all, and the users who can
-- make one can read everyone else's.
--
-- WHAT. This migration adds one row-level-security filter, "UI: Own Projects":
--
--     (OwnerUserID = '{{UserID}}')
--
-- The UI role's MJ: Projects permission row (metadata/entity-permissions/
-- .entity-permissions.json, matched on EntityID + RoleID + Type) then grants
-- Create, Update and Delete, each bound to this filter. Read keeps its own filter.
-- Developer and Integration are unchanged and stay unfiltered.
--
-- WHAT A UI-ONLY USER CAN THEN DO. Every save is checked twice against the
-- filter: the stored row (pre-image) and the row as it will be written
-- (post-image, DatabaseProviderBase step 3b; a create is checked on its new
-- values). So a UI-only user:
--   - creates a folder only with OwnerUserID = themselves (Private or Shared);
--   - renames, moves or deletes only folders they own;
--   - cannot make a folder Public: the post-image has OwnerUserID NULL, which
--     fails the filter;
--   - cannot create, rename, move or delete a Public folder (OwnerUserID NULL) or
--     another user's folder, including one shared with them.
-- Deleting their own folder moves what it holds (another user's subfolder, other
-- users' conversations) out of it as the system user, in the delete's transaction
-- (MJProjectEntityServer.Delete), so the RESTRICT foreign keys do not block it.
--
-- WHY THE FILTER IS IN A MIGRATION. `MJ: Row Level Security Filters` grants Create
-- to no role, so `mj sync push` cannot write it; V202609201900 and V202609260053
-- add their filters the same way.
-- ============================================================================

INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
VALUES (
    '92D0F486-F9E2-4916-A9E5-177024B6CB8C',
    'UI: Own Projects',
    '(OwnerUserID = ''{{UserID}}'')',
    'Narrows writes on MJ: Projects to folders the current user owns. Bound to the UI role''s Create, Update and Delete permissions, so a user whose only folder grant is the UI role creates, renames, moves and deletes their own Private or Shared folders, and cannot make a folder Public (no owner) or change a Public folder or someone else''s. Checked on the stored row and on the row as it will be written.'
);
