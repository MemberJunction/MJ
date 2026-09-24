-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Counterpart of V202608150000__v6.1.x__Queue_Entity_Developer_Integration_Grants.sql
-- ============================================================================
--
-- HAND-PORTED. The AST transpiler classified this migration "regen/reseed only" and emitted
-- nothing executable -- the same empty-transpilation defect class hand-ported in v6.1.0-edge.2
-- (Clear_EntityAction_RelatedNameField, Retire_Workflows_Application,
-- Content_Pipeline_Remove_Fanout_Path). The classification is not unreasonable: `mj codegen`
-- does re-derive these grants from the EntityPermission rows. But it is wrong for the lane this
-- migration exists to serve.
--
-- The T-SQL original states the reason at length: a fresh install and the integration lane run
-- `mj migrate` + `mj sync push` and deliberately run NO CodeGen. Without a GRANT in the migration
-- itself, such a database carries metadata saying Developer/Integration may update a Queue Task
-- while spUpdateQueueTask still grants EXECUTE to cdp_UI only -- correct-looking in Explorer and
-- broken at runtime, which is exactly the failure the T-SQL migration was written to close.
-- Dropping the statements on PostgreSQL would reintroduce that failure on PostgreSQL only.
--
-- Wrapped in DO / EXCEPTION WHEN others THEN NULL per the established convention in this folder:
-- GRANT is idempotent in SQL Server but raises in PostgreSQL when the role or object is absent,
-- and a fresh PG database may not yet carry every cdp_* role. The argument list is omitted from
-- GRANT EXECUTE ON FUNCTION so the grant applies to every overload of that routine name.

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

/* -- MJ: Queue Tasks ------------------------------------------------------------------------ */
DO $$ BEGIN GRANT SELECT  ON          __mj."vwQueueTasks"      TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateQueueTask" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateQueueTask" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueueTask" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;

/* -- MJ: Queues ----------------------------------------------------------------------------- */
DO $$ BEGIN GRANT SELECT  ON          __mj."vwQueues"      TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateQueue" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateQueue" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueue" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;

/* -- MJ: Queue Types ------------------------------------------------------------------------ */
DO $$ BEGIN GRANT SELECT  ON          __mj."vwQueueTypes"      TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateQueueType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateQueueType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueueType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
