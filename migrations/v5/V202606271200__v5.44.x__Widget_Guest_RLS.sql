-- =============================================================================
-- Widget Guest: cross-guest conversation isolation (Row Level Security)
-- =============================================================================
-- Problem (public-web-widget.md W6 finding #1 — the 🔴 critical gap): every
--   anonymous web-widget visitor is synthesized onto the SAME shared Anonymous
--   principal (one UserID), so a per-UserID RLS predicate does NOT isolate one
--   guest's Conversation / Conversation Details from another's. The Widget Guest
--   role's entity permissions stop a guest reaching ARBITRARY entities, but not
--   another guest's conversation on the SAME entity.
--
-- Fix: scope each guest to its OWN session. The guest JWT carries a per-session
--   resource scope (resourceType 'Widget Session', resourceId = the opaque
--   session id), which `buildMagicLinkSessionUser` lifts into the synthesized
--   principal's MagicLinkScope. These RLS filters key on the {{ScopeResourceID}}
--   token (substituted by RowLevelSecurityFilterInfo.MarkupFilterText from that
--   scope) — a value that rides the SIGNED token and therefore cannot be forged
--   by one guest to read another's rows. A guest's conversation is stamped with
--   ExternalID = the session id at create time; details inherit isolation via
--   their parent conversation (so the agent's own AI-reply details — which carry
--   no ExternalID — stay visible to the owning session).
--
-- Why SQL seed (not metadata sync): RowLevelSecurityFilter create is denied to
--   all non-Owner roles, and MetadataSync runs as the System user (not Owner
--   type), so it cannot create these rows — identical to the Magic Link RLS
--   seeds. They are reference data with fixed UUIDs. The EntityPermission ->
--   filter LINK is done in metadata (entity-permissions) via @lookup by Name.
--
-- {{ScopeResourceID}} is the base64url session id ([A-Za-z0-9_-] only — no quote
--   or escape characters), so its substitution into the string literal is
--   injection-safe. An absent scope resolves to '' (fail-closed: matches no rows).
-- =============================================================================

-- Widget Guest: Own Conversations — the guest sees only conversations whose
-- ExternalID matches its signed session scope.
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'A1E6D2C4-4F1B-4C7E-9E3A-1D2B3C4D5E6F')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'A1E6D2C4-4F1B-4C7E-9E3A-1D2B3C4D5E6F',
        'Widget Guest: Own Conversations',
        'ExternalID = ''{{ScopeResourceID}}''',
        'Isolates a public web-widget guest to its OWN conversations. Conversations are stamped with ExternalID = the opaque per-session id at create time; this filter restricts reads/updates to rows matching the session scope ({{ScopeResourceID}}) carried on the signed guest token. Attached to the Widget Guest role''s read+update permission on Conversations so two anonymous guests sharing the Anonymous principal cannot see each other''s conversations.'
    );
END;

-- Widget Guest: Own Conversation Details — details are scoped by their parent
-- conversation's ExternalID (NOT their own), so AI-reply details written by the
-- agent without an ExternalID remain visible to the owning session.
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'B2F7E3D5-5A2C-4D8F-AF4B-2E3C4D5E6F70')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'B2F7E3D5-5A2C-4D8F-AF4B-2E3C4D5E6F70',
        'Widget Guest: Own Conversation Details',
        'ConversationID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')',
        'Isolates a public web-widget guest to the messages of its OWN conversations. Scopes Conversation Details by the parent conversation''s ExternalID (matched against the session scope {{ScopeResourceID}} on the signed guest token) rather than the detail''s own ExternalID — so the agent''s AI-reply details (which carry no ExternalID) stay visible to the owning session while remaining hidden from other guests. Attached to the Widget Guest role''s read+update permission on Conversation Details.'
    );
END;
