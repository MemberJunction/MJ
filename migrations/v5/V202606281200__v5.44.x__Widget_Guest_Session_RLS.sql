-- ============================================================================
-- Widget Guest — Realtime Agent Session RLS
-- ============================================================================
-- Extends the public web-widget guest isolation (V202606271200) to the realtime
-- VOICE path. Starting a voice session persists rows in MJ: AI Agent Sessions and
-- MJ: AI Agent Session Channels under the shared Anonymous principal. Without RLS,
-- one guest could read every guest's agent sessions. These two filters scope a guest
-- to its OWN session, chained off the same signed per-session scope ({{ScopeResourceID}})
-- the widget already uses:
--
--   AI Agent Sessions      → scoped by ConversationID (the session's Conversation is
--                            stamped with ExternalID = the guest scope in SessionManager).
--   AI Agent Session Channels → scoped by AgentSessionID → that session's Conversation.
--
-- {{ScopeResourceID}} is the base64url session id ([A-Za-z0-9_-] only — no quote escaping
-- needed) substituted by RowLevelSecurityFilterInfo.MarkupFilterText from the signed
-- guest token's scope. These filters are LINKED to the Widget Guest role's read+update
-- permissions in metadata (entity-permissions) via @lookup by Name. They are created in
-- SQL (not metadata) because creating an RLS filter is denied to non-Owner principals.
-- ============================================================================

-- Widget Guest: Own Agent Sessions ------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'B1E7C0A2-3D4F-4A5B-8C6D-7E8F9A0B1C2D')
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'B1E7C0A2-3D4F-4A5B-8C6D-7E8F9A0B1C2D',
        'Widget Guest: Own Agent Sessions',
        'ConversationID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')',
        'Isolates a public web-widget VOICE guest to its OWN realtime agent sessions. A session''s Conversation is stamped with ExternalID = the opaque per-session id at create time; this filter restricts reads/updates of MJ: AI Agent Sessions to rows whose Conversation matches the session scope ({{ScopeResourceID}}) carried on the signed guest token. Attached to the Widget Guest role''s read+update permission on AI Agent Sessions so two anonymous guests sharing the Anonymous principal cannot see each other''s sessions.'
    );

-- Widget Guest: Own Agent Session Channels ----------------------------------------------
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'C2F8D1B3-4E5A-4B6C-9D7E-8F0A1B2C3D4E')
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'C2F8D1B3-4E5A-4B6C-9D7E-8F0A1B2C3D4E',
        'Widget Guest: Own Agent Session Channels',
        'AgentSessionID IN (SELECT ID FROM ${flyway:defaultSchema}.vwAIAgentSessions WHERE ConversationID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}''))',
        'Isolates a public web-widget VOICE guest to the channels of its OWN realtime agent sessions. Scopes MJ: AI Agent Session Channels by the parent session''s Conversation ExternalID (matched against the session scope {{ScopeResourceID}} on the signed guest token). Attached to the Widget Guest role''s read+update permission on AI Agent Session Channels.'
    );
