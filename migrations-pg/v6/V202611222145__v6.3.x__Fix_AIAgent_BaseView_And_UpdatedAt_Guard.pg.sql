-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611222145__v6.3.x__Fix_AIAgent_BaseView_And_UpdatedAt_Guard.sql
-- Paired PostgreSQL parity migration for V202611222145__v6.3.x__Fix_AIAgent_BaseView_And_UpdatedAt_Guard.sql.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ===================== HAND-FINISHED (v6.3.0-edge.2 release build) =====================
-- The SQL Server migration is a forward-only repair of the SS side of V202611221400. It does three things:
--
--  1. vwAIAgents: OwnerUserID → User back to LEFT OUTER JOIN (221400's SS view had INNER JOIN).
--     NO-OP ON PG: V202611221400.pg.sql already builds vwAIAgents with LEFT OUTER JOIN on
--     MJUser_OwnerUserID (its native PG CodeGen bake never had the INNER JOIN).
--
--  2. spUpdateAIAgent sets [__mj_UpdatedAt] = GETUTCDATE() and trgUpdateAIAgent regains its
--     IF NOT UPDATE([__mj_UpdatedAt]) guard (metadata-consistency MC9).
--     NO-OP ON PG, the same reasoning as V202611121645 / V202611140845 (PG-EMPTY-BY-DESIGN at
--     v6.3.0-edge.1): the SS trigger is an AFTER trigger that writes the row a second time; PG's
--     trgUpdateAIAgent is a BEFORE UPDATE row trigger that sets NEW."__mj_UpdatedAt" in place, so
--     there is no double write to guard and no SS-only clause to restore.
--
--  3. EXEC sp_refreshview 'vwAIAgentsActive' after the vwAIAgents rebuild.
--     NEEDED ON PG: V202611221400.pg.sql regenerates vwAIAgents with DROP … CASCADE and restores
--     vwAIAgentsActive from its saved pg_get_viewdef text, i.e. with the frozen 99-column list, so
--     the new AIAgent.Isolation column is missing from vwAIAgentsActive (vwAIAgents 100 columns,
--     vwAIAgentsActive 99 on a database migrated through 221400). sp_refreshview's PG equivalent is
--     to rebuild the g.* wrapper: same filter, same grants; nothing depends on vwAIAgentsActive.
--     (DROP + CREATE, not CREATE OR REPLACE: Isolation sits inside a.*, not at the end.)
--
-- The split converter's output for this file was not usable: `DROP VIEW __mj."vwAIAgents"` without
-- CASCADE (fails on the dependent vwAIAgentsActive), `DROP PROCEDURE __mj."spUpdateAIAgent"` (a
-- FUNCTION on PG), and sp_refreshview / REVOKE / DROP TRIGGER reported as unhandled. No CodeGen bake:
-- the PG objects of MJ: AI Agents are already current from V202611221400.pg.sql.
DROP VIEW IF EXISTS __mj."vwAIAgentsActive";
CREATE VIEW __mj."vwAIAgentsActive" AS
SELECT g.*
FROM __mj."vwAIAgents" AS g
WHERE g."Status" = 'Active' AND g."IsRestricted" = false;
GRANT SELECT ON __mj."vwAIAgentsActive" TO "cdp_UI", "cdp_Developer", "cdp_Integration";
-- ===================== END HAND-FINISHED =====================
