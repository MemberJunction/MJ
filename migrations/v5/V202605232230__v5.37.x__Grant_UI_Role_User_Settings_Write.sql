-- Grant the UI role Create + Update permissions on MJ: User Settings.
--
-- Context: the baseline EntityPermission seed gives UI {Read:1, Create:0,
-- Update:0, Delete:0} on MJ: User Settings — read-only. But __mj.UserSetting
-- exists specifically to let users persist their *own* preferences (default
-- views, dismissed prompts, consent acknowledgements, etc.), and the
-- UNIQUE (UserID, Setting) constraint guarantees a row can only belong to
-- the user who created it. With read-only access, UserInfoEngine.SetSetting
-- silently fails for any UI-role user, which surfaces as bugs like:
--   • the Agent Feedback consent dialog re-prompting on every rating
--   • per-user default views not sticking across sessions
--
-- This migration flips Create + Update to 1 for the UI role on MJ: User
-- Settings only. Delete stays 0 (no need for users to delete their own
-- settings rows; the upsert pattern handles changes). Idempotent — re-runs
-- are no-ops because the UPDATE only touches rows where the flags are still
-- 0, and the safety INSERT only fires if no row exists at all.
--
-- UI Role ID:                  E0AFCCEC-6A37-EF11-86D4-000D3A4E707E
-- MJ: User Settings Entity ID: 2861DD69-94B4-475D-B3ED-F9663A25C58B

UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1,
    CanUpdate = 1
WHERE EntityID = '2861DD69-94B4-475D-B3ED-F9663A25C58B'
  AND RoleID   = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
  AND (CanCreate = 0 OR CanUpdate = 0);

-- Safety: in the unusual case where the baseline row was never inserted (e.g.
-- a partial baseline run), insert one with the intended grants. NewID() keeps
-- the migration self-contained for any environment without colliding on PK.
IF NOT EXISTS (
    SELECT 1
    FROM ${flyway:defaultSchema}.EntityPermission
    WHERE EntityID = '2861DD69-94B4-475D-B3ED-F9663A25C58B'
      AND RoleID   = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.EntityPermission (
        ID, EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete
    ) VALUES (
        NEWID(),
        '2861DD69-94B4-475D-B3ED-F9663A25C58B',
        'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
        1, 1, 1, 0
    );
END;
