-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611161547__v6.3.x__Widget_Guest_Own_Row_Filters.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ===================== HAND-FINISHED (v6.3.0-edge.1 release build) =====================
-- Row filters for three Widget Guest grants that had none (see the SQL Server migration header).
--
-- The split converter drops the whole DECLARE + MERGE batch and writes "no DDL to translate", so
-- the three RowLevelSecurityFilter rows never reached PostgreSQL. Ported by hand: same fixed IDs,
-- names, descriptions and FilterText (FilterText keeps the T-SQL-style unquoted identifiers, as
-- the shipped Widget Guest filters on PG do, e.g. V202608300200). Re-runnable like the source
-- MERGE: an existing row is updated in place. The EntityPermission links ship in
-- metadata/entity-permissions/.entity-permissions.json via mj sync push.
INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "Description", "FilterText")
VALUES
    ('E5EEC668-2A81-46C2-AB14-D878B8E9A8CC', 'Widget Guest: Own Agent Requests',
        'Limits a public web-widget guest to the MJ: AI Agent Requests raised by agent runs in its own session. AIAgentRequest has no ConversationID, so the filter goes through OriginatingAgentRunID to the agent run, then to the Conversation whose ExternalID equals the per-session scope ({{ScopeResourceID}}) on the signed guest token. Requests with no originating run match no row. Attached to the Widget Guest role''s read and update permission on MJ: AI Agent Requests.',
        'OriginatingAgentRunID IN (SELECT ID FROM __mj.vwAIAgentRuns WHERE ConversationID IN (SELECT ID FROM __mj.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}''))'),

    ('71EA442F-ED8E-46E9-9AC4-6C8D8F919D73', 'Widget Guest: Own Conversation Skills',
        'Limits a public web-widget guest to the MJ: Conversation Skills of its own session Conversation, the one whose ExternalID equals the per-session scope ({{ScopeResourceID}}) on the signed guest token. Attached to the Widget Guest role''s read and update permission on MJ: Conversation Skills.',
        'ConversationID IN (SELECT ID FROM __mj.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')'),

    ('D401A7C8-1A5B-4A9D-B931-AFBEEE5F2F6E', 'Widget Guest: Own Conversation Detail Artifacts',
        'Limits a public web-widget guest to the MJ: Conversation Detail Artifacts linked to messages in its own session Conversation. The filter goes through ConversationDetailID to the Conversation Detail, then to the Conversation whose ExternalID equals the per-session scope ({{ScopeResourceID}}) on the signed guest token. Attached to the Widget Guest role''s read permission on MJ: Conversation Detail Artifacts.',
        'ConversationDetailID IN (SELECT ID FROM __mj.vwConversationDetails WHERE ConversationID IN (SELECT ID FROM __mj.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}''))')
ON CONFLICT ("ID") DO UPDATE
SET "Name" = EXCLUDED."Name", "Description" = EXCLUDED."Description", "FilterText" = EXCLUDED."FilterText";
