-- =====================================================================================
-- Scope the UI role's realtime agent-session access to the user's own sessions.
--
-- The UI role gained read/create/update on `MJ: AI Agent Sessions` and
-- `MJ: AI Agent Session Channels` so that ordinary signed-in users can mint and close
-- realtime co-agent sessions — MJ Explorer and the native mobile app both need it, and
-- the `Widget Guest` role already had it while `UI` did not.
--
-- Unscoped, those grants are too wide: the UI role is held by every ordinary user, both
-- entities are keyed to a user, and read/update with no filter means one user can read
-- and modify another's sessions — `Config_`, `RecordingFileID`, `LinkedRecordID` and all.
--
-- These two filters are the `UI:`-prefixed counterparts of the `Widget Guest:` filters
-- added in V202607061250. The widget ones scope by the signed guest token's
-- `{{ScopeResourceID}}`; a signed-in user has a real identity, so these scope by
-- `{{UserID}}` — the same substitution `UI: Own AI Agent Runs` already uses.
--
-- The rows live in a migration rather than under `metadata/` because
-- `MJ: Row Level Security Filters` grants Create to no role, so `mj sync push` cannot
-- write them. That is also why the Widget Guest filters were seeded this way.
--
-- The EntityPermission rows that REFERENCE these filters are metadata
-- (`metadata/entity-permissions/.entity-permissions.json`) and are applied by
-- `mj sync push`; this migration only has to guarantee the filters exist first.
-- =====================================================================================

-- UI: Own Agent Sessions — a signed-in user sees and edits only their own sessions.
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'A4C4E680-8BBF-48B2-B77A-2DF120A5E469')
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'A4C4E680-8BBF-48B2-B77A-2DF120A5E469',
        'UI: Own Agent Sessions',
        'UserID = ''{{UserID}}''',
        'Narrows MJ: AI Agent Sessions to sessions owned by the current user. Attached to the UI role''s read + update permission on the entity, which MJ Explorer and the native mobile app both need in order to mint and close realtime co-agent sessions. Without it, any signed-in user could read and modify another user''s sessions, since the UI role is held by every ordinary user. The Widget Guest equivalent scopes by the guest token''s ExternalID instead of a user id.'
    );

-- UI: Own Agent Session Channels — no UserID column, so it scopes through the parent
-- session, the same shape as 'UI: Own AI Agent Run Steps'.
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'B0B439A8-C355-4995-8168-6EE805F32A7A')
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'B0B439A8-C355-4995-8168-6EE805F32A7A',
        'UI: Own Agent Session Channels',
        'AgentSessionID IN (SELECT ID FROM ${flyway:defaultSchema}.vwAIAgentSessions WHERE UserID = ''{{UserID}}'')',
        'Narrows MJ: AI Agent Session Channels to the channels of the current user''s own agent sessions. The entity has no UserID column, so it scopes through its parent session — the same shape as ''UI: Own AI Agent Run Steps''. Attached to the UI role''s read + update permission on the entity.'
    );
