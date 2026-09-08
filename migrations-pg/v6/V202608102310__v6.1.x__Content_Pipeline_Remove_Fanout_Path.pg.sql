-- V202608102310__v6.1.x__Content_Pipeline_Remove_Fanout_Path.sql — no DDL to translate.
-- ============================================================================
-- HAND-PORTED BODY
--
-- The split converter classified this as "no DDL to translate" and emitted only the marker line
-- above — but the migration is not DDL-free, it is a guarded metadata DELETE. Left as the marker,
-- PostgreSQL would keep the broad->draft path that this release removes, so the shipped Content
-- Pipeline demo would still contain the AND-join a Flow agent cannot express.
--
-- Deletion goes through the generated delete function rather than a raw DELETE, for the same reason
-- the SS original uses spDeleteAIAgentStepPath: cascades and delete semantics are whatever the
-- generated layer says they are, not whatever this migration assumes. Shape follows the guarded
-- PERFORM idiom used by the committed v5 counterparts.
--
-- Idempotent: deletes by hardcoded id if present, and says so if it is already gone.
-- ============================================================================

DO $$
DECLARE
    v_broad_to_draft_path_id CONSTANT UUID := '3A773E7E-7C54-40FA-BF6E-E4509A3E01C5';
BEGIN
    IF EXISTS (SELECT 1 FROM __mj."AIAgentStepPath" WHERE "ID" = v_broad_to_draft_path_id) THEN
        PERFORM __mj."spDeleteAIAgentStepPath"(p_ID := v_broad_to_draft_path_id);
        RAISE NOTICE 'Removed the Content Pipeline broad->draft path; its research steps now run as a chain.';
    ELSE
        RAISE NOTICE 'Content Pipeline broad->draft path not present; nothing to remove.';
    END IF;
END $$;
