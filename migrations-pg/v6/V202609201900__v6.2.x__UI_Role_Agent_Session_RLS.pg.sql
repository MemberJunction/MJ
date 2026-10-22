-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609201900__v6.2.x__UI_Role_Agent_Session_RLS.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = 'A4C4E680-8BBF-48B2-B77A-2DF120A5E469') THEN
    INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "FilterText", "Description") VALUES ('A4C4E680-8BBF-48B2-B77A-2DF120A5E469', 'UI: Own Agent Sessions', 'UserID = ''{{UserID}}''', 'Narrows MJ: AI Agent Sessions to sessions owned by the current user. Attached to the UI role''s read + update permission on the entity, which MJ Explorer and the native mobile app both need in order to mint and close realtime co-agent sessions. Without it, any signed-in user could read and modify another user''s sessions, since the UI role is held by every ordinary user. The Widget Guest equivalent scopes by the guest token''s ExternalID instead of a user id.');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = 'B0B439A8-C355-4995-8168-6EE805F32A7A') THEN
    INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "FilterText", "Description") VALUES ('B0B439A8-C355-4995-8168-6EE805F32A7A', 'UI: Own Agent Session Channels', 'AgentSessionID IN (SELECT ID FROM __mj.vwAIAgentSessions WHERE UserID = ''{{UserID}}'')', 'Narrows MJ: AI Agent Session Channels to the channels of the current user''s own agent sessions. The entity has no UserID column, so it scopes through its parent session — the same shape as ''UI: Own AI Agent Run Steps''. Attached to the UI role''s read + update permission on the entity.');
  END IF;
END $$;
