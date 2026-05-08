-- ============================================================================
-- V202605051630 — Recreate 12 CRUD functions orphaned by the v5.33.x cleanup
-- chain on fresh-DB applies.
--
-- Background:
--   V202605032310 (Self_Heal) and V202605032116 (Force_Regen_Tolerant_SP)
--   both rebuild SPs by `EXECUTE 'DROP FUNCTION ' || sig` (NO CASCADE) inside
--   DO blocks, then `CREATE OR REPLACE`. When 032310's signature differs from
--   032116's existing definition, PG creates the new signature as a *new*
--   overload alongside the old one, leaving multiple overloads when the
--   pre-existing definition has dependents the bare DROP couldn't remove.
--   V202605041500 (Cleanup_Duplicate_Function_Overloads) then sees those
--   multi-overload names, drops *every* overload with CASCADE, and relies
--   on `mj codegen` to regenerate. But codegen only re-emits SPs for entities
--   in `modifiedEntityList` — fresh installs that match the canonical schema
--   leave these names regenerated, and the 12 functions below end up missing
--   from the database despite all migrations reporting success=true.
--
-- Customer-side observation (Aurora, fresh __mj schema, claude/pg-combined
-- @ d7ac276):
--   12 CRUD routines flagged by codegen post-validation as missing:
--     spCreateAIAgentRun, spUpdateAIAgentRun
--     spCreateAIPromptRun, spUpdateAIPromptRun
--     spCreateConversation, spUpdateConversation
--     spCreateConversationDetail, spUpdateConversationDetail
--     spCreateTestRunFeedback, spUpdateTestRunFeedback
--     spCreateTestRunOutput, spUpdateTestRunOutput
--
-- Fix: explicitly recreate all 12 with a clean DROP-CASCADE-then-CREATE flow
-- using the latest committed signatures. Idempotent: safe to apply against a
-- DB where some/all already exist (CASCADE drop clears any signature drift,
-- CREATE OR REPLACE follows). Future schema changes to these entities should
-- be picked up by codegen; this migration is a one-time recovery.
--
-- IMPORTANT — view-independence:
--
-- The original V202605032116 / V202605032310 SP definitions declare
-- `RETURNS SETOF __mj."vw<Entity>s"`. PG resolves SETOF result types at
-- function-create time, not function-call time, so the view must already
-- exist when CREATE FUNCTION runs. On the customer's fresh-drop replay path
-- the same V202605041500 cleanup that orphaned these 12 sprocs ALSO
-- destroyed several supporting views via CASCADE drops upstream — so an
-- earlier draft of this migration that copied the upstream `RETURNS SETOF
-- vw<Entity>s` shape failed to apply with `type "__mj.vwAIAgentRuns" does
-- not exist`.
--
-- This rewrite uses `RETURNS SETOF __mj."<BaseTable>"` instead — base tables
-- are created by the v5.0 baseline and never CASCADE-dropped, so this
-- migration applies regardless of whether the views are currently present.
-- The body's terminal `RETURN QUERY SELECT * FROM __mj."<BaseTable>"` is
-- adjusted to match. The trade-off: callers receive only base-table
-- columns, not the view's joined-name columns. Codegen will regenerate the
-- richer view-typed version on a subsequent codegen pass; this is a
-- recovery floor, not the steady-state shape.
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateAIAgentRun
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRun'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateAIAgentRun"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_ParentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentRunID UUID DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Success_Clear BOOLEAN DEFAULT FALSE,
    IN p_Success BOOLEAN DEFAULT NULL,
    IN p_ErrorMessage_Clear BOOLEAN DEFAULT FALSE,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_ConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Result_Clear BOOLEAN DEFAULT FALSE,
    IN p_Result TEXT DEFAULT NULL,
    IN p_AgentState_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentState TEXT DEFAULT NULL,
    IN p_TotalTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCost_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCost NUMERIC(18,6) DEFAULT NULL,
    IN p_TotalPromptTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalPromptTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCompletionTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCompletionTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalPromptTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalPromptTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalCompletionTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCompletionTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalCostRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCostRollup NUMERIC(19,8) DEFAULT NULL,
    IN p_ConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ConversationDetailSequence_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailSequence INTEGER DEFAULT NULL,
    IN p_CancellationReason_Clear BOOLEAN DEFAULT FALSE,
    IN p_CancellationReason VARCHAR(30) DEFAULT NULL,
    IN p_FinalStep_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalStep VARCHAR(30) DEFAULT NULL,
    IN p_FinalPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalPayload TEXT DEFAULT NULL,
    IN p_Message_Clear BOOLEAN DEFAULT FALSE,
    IN p_Message TEXT DEFAULT NULL,
    IN p_LastRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRunID UUID DEFAULT NULL,
    IN p_StartingPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartingPayload TEXT DEFAULT NULL,
    IN p_TotalPromptIterations INTEGER DEFAULT NULL,
    IN p_ConfigurationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConfigurationID UUID DEFAULT NULL,
    IN p_OverrideModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OverrideModelID UUID DEFAULT NULL,
    IN p_OverrideVendorID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OverrideVendorID UUID DEFAULT NULL,
    IN p_Data_Clear BOOLEAN DEFAULT FALSE,
    IN p_Data TEXT DEFAULT NULL,
    IN p_Verbose_Clear BOOLEAN DEFAULT FALSE,
    IN p_Verbose BOOLEAN DEFAULT NULL,
    IN p_EffortLevel_Clear BOOLEAN DEFAULT FALSE,
    IN p_EffortLevel INTEGER DEFAULT NULL,
    IN p_RunName_Clear BOOLEAN DEFAULT FALSE,
    IN p_RunName VARCHAR(255) DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_ScheduledJobRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScheduledJobRunID UUID DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_PrimaryScopeEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeEntityID UUID DEFAULT NULL,
    IN p_PrimaryScopeRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeRecordID VARCHAR(100) DEFAULT NULL,
    IN p_SecondaryScopes_Clear BOOLEAN DEFAULT FALSE,
    IN p_SecondaryScopes TEXT DEFAULT NULL,
    IN p_ExternalReferenceID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalReferenceID VARCHAR(200) DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."AIAgentRun" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO ${flyway:defaultSchema}."AIAgentRun"
            (
                "ID",
                "AgentID",
                "ParentRunID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "Success",
                "ErrorMessage",
                "ConversationID",
                "UserID",
                "Result",
                "AgentState",
                "TotalTokensUsed",
                "TotalCost",
                "TotalPromptTokensUsed",
                "TotalCompletionTokensUsed",
                "TotalTokensUsedRollup",
                "TotalPromptTokensUsedRollup",
                "TotalCompletionTokensUsedRollup",
                "TotalCostRollup",
                "ConversationDetailID",
                "ConversationDetailSequence",
                "CancellationReason",
                "FinalStep",
                "FinalPayload",
                "Message",
                "LastRunID",
                "StartingPayload",
                "TotalPromptIterations",
                "ConfigurationID",
                "OverrideModelID",
                "OverrideVendorID",
                "Data",
                "Verbose",
                "EffortLevel",
                "RunName",
                "Comments",
                "ScheduledJobRunID",
                "TestRunID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "ExternalReferenceID",
                "CompanyID"
            )
        VALUES
            (
                p_ID,
                p_AgentID,
                CASE WHEN p_ParentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentRunID, NULL) END,
                COALESCE(p_Status, 'Running'),
                COALESCE(p_StartedAt, NOW()),
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END,
                CASE WHEN p_Success_Clear = TRUE THEN NULL ELSE COALESCE(p_Success, NULL) END,
                CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, NULL) END,
                CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_Result_Clear = TRUE THEN NULL ELSE COALESCE(p_Result, NULL) END,
                CASE WHEN p_AgentState_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentState, NULL) END,
                CASE WHEN p_TotalTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsed, 0) END,
                CASE WHEN p_TotalCost_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCost, 0.000000) END,
                CASE WHEN p_TotalPromptTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsed, NULL) END,
                CASE WHEN p_TotalCompletionTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsed, NULL) END,
                CASE WHEN p_TotalTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalPromptTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalCompletionTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalCostRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCostRollup, NULL) END,
                CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, NULL) END,
                CASE WHEN p_ConversationDetailSequence_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailSequence, NULL) END,
                CASE WHEN p_CancellationReason_Clear = TRUE THEN NULL ELSE COALESCE(p_CancellationReason, NULL) END,
                CASE WHEN p_FinalStep_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalStep, NULL) END,
                CASE WHEN p_FinalPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayload, NULL) END,
                CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, NULL) END,
                CASE WHEN p_LastRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunID, NULL) END,
                CASE WHEN p_StartingPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayload, NULL) END,
                COALESCE(p_TotalPromptIterations, 0),
                CASE WHEN p_ConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConfigurationID, NULL) END,
                CASE WHEN p_OverrideModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideModelID, NULL) END,
                CASE WHEN p_OverrideVendorID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideVendorID, NULL) END,
                CASE WHEN p_Data_Clear = TRUE THEN NULL ELSE COALESCE(p_Data, NULL) END,
                CASE WHEN p_Verbose_Clear = TRUE THEN NULL ELSE COALESCE(p_Verbose, FALSE) END,
                CASE WHEN p_EffortLevel_Clear = TRUE THEN NULL ELSE COALESCE(p_EffortLevel, NULL) END,
                CASE WHEN p_RunName_Clear = TRUE THEN NULL ELSE COALESCE(p_RunName, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                CASE WHEN p_ScheduledJobRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ScheduledJobRunID, NULL) END,
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END,
                CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, NULL) END,
                CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, NULL) END,
                CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, NULL) END,
                CASE WHEN p_ExternalReferenceID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalReferenceID, NULL) END,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO ${flyway:defaultSchema}."AIAgentRun"
            (
                "AgentID",
                "ParentRunID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "Success",
                "ErrorMessage",
                "ConversationID",
                "UserID",
                "Result",
                "AgentState",
                "TotalTokensUsed",
                "TotalCost",
                "TotalPromptTokensUsed",
                "TotalCompletionTokensUsed",
                "TotalTokensUsedRollup",
                "TotalPromptTokensUsedRollup",
                "TotalCompletionTokensUsedRollup",
                "TotalCostRollup",
                "ConversationDetailID",
                "ConversationDetailSequence",
                "CancellationReason",
                "FinalStep",
                "FinalPayload",
                "Message",
                "LastRunID",
                "StartingPayload",
                "TotalPromptIterations",
                "ConfigurationID",
                "OverrideModelID",
                "OverrideVendorID",
                "Data",
                "Verbose",
                "EffortLevel",
                "RunName",
                "Comments",
                "ScheduledJobRunID",
                "TestRunID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "ExternalReferenceID",
                "CompanyID"
            )
        VALUES
            (
                p_AgentID,
                CASE WHEN p_ParentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentRunID, NULL) END,
                COALESCE(p_Status, 'Running'),
                COALESCE(p_StartedAt, NOW()),
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END,
                CASE WHEN p_Success_Clear = TRUE THEN NULL ELSE COALESCE(p_Success, NULL) END,
                CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, NULL) END,
                CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_Result_Clear = TRUE THEN NULL ELSE COALESCE(p_Result, NULL) END,
                CASE WHEN p_AgentState_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentState, NULL) END,
                CASE WHEN p_TotalTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsed, 0) END,
                CASE WHEN p_TotalCost_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCost, 0.000000) END,
                CASE WHEN p_TotalPromptTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsed, NULL) END,
                CASE WHEN p_TotalCompletionTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsed, NULL) END,
                CASE WHEN p_TotalTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalPromptTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalCompletionTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalCostRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCostRollup, NULL) END,
                CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, NULL) END,
                CASE WHEN p_ConversationDetailSequence_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailSequence, NULL) END,
                CASE WHEN p_CancellationReason_Clear = TRUE THEN NULL ELSE COALESCE(p_CancellationReason, NULL) END,
                CASE WHEN p_FinalStep_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalStep, NULL) END,
                CASE WHEN p_FinalPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayload, NULL) END,
                CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, NULL) END,
                CASE WHEN p_LastRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunID, NULL) END,
                CASE WHEN p_StartingPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayload, NULL) END,
                COALESCE(p_TotalPromptIterations, 0),
                CASE WHEN p_ConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConfigurationID, NULL) END,
                CASE WHEN p_OverrideModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideModelID, NULL) END,
                CASE WHEN p_OverrideVendorID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideVendorID, NULL) END,
                CASE WHEN p_Data_Clear = TRUE THEN NULL ELSE COALESCE(p_Data, NULL) END,
                CASE WHEN p_Verbose_Clear = TRUE THEN NULL ELSE COALESCE(p_Verbose, FALSE) END,
                CASE WHEN p_EffortLevel_Clear = TRUE THEN NULL ELSE COALESCE(p_EffortLevel, NULL) END,
                CASE WHEN p_RunName_Clear = TRUE THEN NULL ELSE COALESCE(p_RunName, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                CASE WHEN p_ScheduledJobRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ScheduledJobRunID, NULL) END,
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END,
                CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, NULL) END,
                CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, NULL) END,
                CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, NULL) END,
                CASE WHEN p_ExternalReferenceID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalReferenceID, NULL) END,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."AIAgentRun" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateAIAgentRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateAIAgentRun
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRun'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateAIAgentRun"(
    IN p_ID UUID,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_ParentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentRunID UUID DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Success_Clear BOOLEAN DEFAULT FALSE,
    IN p_Success BOOLEAN DEFAULT NULL,
    IN p_ErrorMessage_Clear BOOLEAN DEFAULT FALSE,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_ConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Result_Clear BOOLEAN DEFAULT FALSE,
    IN p_Result TEXT DEFAULT NULL,
    IN p_AgentState_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentState TEXT DEFAULT NULL,
    IN p_TotalTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCost_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCost NUMERIC(18,6) DEFAULT NULL,
    IN p_TotalPromptTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalPromptTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCompletionTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCompletionTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalPromptTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalPromptTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalCompletionTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCompletionTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalCostRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCostRollup NUMERIC(19,8) DEFAULT NULL,
    IN p_ConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ConversationDetailSequence_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailSequence INTEGER DEFAULT NULL,
    IN p_CancellationReason_Clear BOOLEAN DEFAULT FALSE,
    IN p_CancellationReason VARCHAR(30) DEFAULT NULL,
    IN p_FinalStep_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalStep VARCHAR(30) DEFAULT NULL,
    IN p_FinalPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalPayload TEXT DEFAULT NULL,
    IN p_Message_Clear BOOLEAN DEFAULT FALSE,
    IN p_Message TEXT DEFAULT NULL,
    IN p_LastRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRunID UUID DEFAULT NULL,
    IN p_StartingPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartingPayload TEXT DEFAULT NULL,
    IN p_TotalPromptIterations INTEGER DEFAULT NULL,
    IN p_ConfigurationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConfigurationID UUID DEFAULT NULL,
    IN p_OverrideModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OverrideModelID UUID DEFAULT NULL,
    IN p_OverrideVendorID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OverrideVendorID UUID DEFAULT NULL,
    IN p_Data_Clear BOOLEAN DEFAULT FALSE,
    IN p_Data TEXT DEFAULT NULL,
    IN p_Verbose_Clear BOOLEAN DEFAULT FALSE,
    IN p_Verbose BOOLEAN DEFAULT NULL,
    IN p_EffortLevel_Clear BOOLEAN DEFAULT FALSE,
    IN p_EffortLevel INTEGER DEFAULT NULL,
    IN p_RunName_Clear BOOLEAN DEFAULT FALSE,
    IN p_RunName VARCHAR(255) DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_ScheduledJobRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScheduledJobRunID UUID DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_PrimaryScopeEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeEntityID UUID DEFAULT NULL,
    IN p_PrimaryScopeRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeRecordID VARCHAR(100) DEFAULT NULL,
    IN p_SecondaryScopes_Clear BOOLEAN DEFAULT FALSE,
    IN p_SecondaryScopes TEXT DEFAULT NULL,
    IN p_ExternalReferenceID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalReferenceID VARCHAR(200) DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."AIAgentRun" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        ${flyway:defaultSchema}."AIAgentRun"
    SET
        "AgentID" = COALESCE(p_AgentID, "AgentID"),
        "ParentRunID" = CASE WHEN p_ParentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentRunID, "ParentRunID") END,
        "Status" = COALESCE(p_Status, "Status"),
        "StartedAt" = COALESCE(p_StartedAt, "StartedAt"),
        "CompletedAt" = CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, "CompletedAt") END,
        "Success" = CASE WHEN p_Success_Clear = TRUE THEN NULL ELSE COALESCE(p_Success, "Success") END,
        "ErrorMessage" = CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, "ErrorMessage") END,
        "ConversationID" = CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, "ConversationID") END,
        "UserID" = CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, "UserID") END,
        "Result" = CASE WHEN p_Result_Clear = TRUE THEN NULL ELSE COALESCE(p_Result, "Result") END,
        "AgentState" = CASE WHEN p_AgentState_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentState, "AgentState") END,
        "TotalTokensUsed" = CASE WHEN p_TotalTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsed, "TotalTokensUsed") END,
        "TotalCost" = CASE WHEN p_TotalCost_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCost, "TotalCost") END,
        "TotalPromptTokensUsed" = CASE WHEN p_TotalPromptTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsed, "TotalPromptTokensUsed") END,
        "TotalCompletionTokensUsed" = CASE WHEN p_TotalCompletionTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsed, "TotalCompletionTokensUsed") END,
        "TotalTokensUsedRollup" = CASE WHEN p_TotalTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsedRollup, "TotalTokensUsedRollup") END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_TotalPromptTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsedRollup, "TotalPromptTokensUsedRollup") END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_TotalCompletionTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsedRollup, "TotalCompletionTokensUsedRollup") END,
        "TotalCostRollup" = CASE WHEN p_TotalCostRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCostRollup, "TotalCostRollup") END,
        "ConversationDetailID" = CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, "ConversationDetailID") END,
        "ConversationDetailSequence" = CASE WHEN p_ConversationDetailSequence_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailSequence, "ConversationDetailSequence") END,
        "CancellationReason" = CASE WHEN p_CancellationReason_Clear = TRUE THEN NULL ELSE COALESCE(p_CancellationReason, "CancellationReason") END,
        "FinalStep" = CASE WHEN p_FinalStep_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalStep, "FinalStep") END,
        "FinalPayload" = CASE WHEN p_FinalPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayload, "FinalPayload") END,
        "Message" = CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, "Message") END,
        "LastRunID" = CASE WHEN p_LastRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunID, "LastRunID") END,
        "StartingPayload" = CASE WHEN p_StartingPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayload, "StartingPayload") END,
        "TotalPromptIterations" = COALESCE(p_TotalPromptIterations, "TotalPromptIterations"),
        "ConfigurationID" = CASE WHEN p_ConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConfigurationID, "ConfigurationID") END,
        "OverrideModelID" = CASE WHEN p_OverrideModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideModelID, "OverrideModelID") END,
        "OverrideVendorID" = CASE WHEN p_OverrideVendorID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideVendorID, "OverrideVendorID") END,
        "Data" = CASE WHEN p_Data_Clear = TRUE THEN NULL ELSE COALESCE(p_Data, "Data") END,
        "Verbose" = CASE WHEN p_Verbose_Clear = TRUE THEN NULL ELSE COALESCE(p_Verbose, "Verbose") END,
        "EffortLevel" = CASE WHEN p_EffortLevel_Clear = TRUE THEN NULL ELSE COALESCE(p_EffortLevel, "EffortLevel") END,
        "RunName" = CASE WHEN p_RunName_Clear = TRUE THEN NULL ELSE COALESCE(p_RunName, "RunName") END,
        "Comments" = CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, "Comments") END,
        "ScheduledJobRunID" = CASE WHEN p_ScheduledJobRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ScheduledJobRunID, "ScheduledJobRunID") END,
        "TestRunID" = CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, "TestRunID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, "SecondaryScopes") END,
        "ExternalReferenceID" = CASE WHEN p_ExternalReferenceID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalReferenceID, "ExternalReferenceID") END,
        "CompanyID" = CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, "CompanyID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."AIAgentRun" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."AIAgentRun" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateAIAgentRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateAIPromptRun
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPromptRun'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateAIPromptRun"(
    p_assistantprefill text DEFAULT NULL,
    p_testrunid uuid DEFAULT NULL,
    p_comments text DEFAULT NULL,
    p_runname varchar(255) DEFAULT NULL,
    p_effortlevel int4 DEFAULT NULL,
    p_modelspecificresponsedetails text DEFAULT NULL,
    p_completiontime int4 DEFAULT NULL,
    p_prompttime int4 DEFAULT NULL,
    p_queuetime int4 DEFAULT NULL,
    p_childpromptid uuid DEFAULT NULL,
    p_errordetails text DEFAULT NULL,
    p_firsttokentime int4 DEFAULT NULL,
    p_streamingenabled_clear boolean DEFAULT false,
    p_streamingenabled bool DEFAULT NULL,
    p_wasselectedresult_clear boolean DEFAULT false,
    p_wasselectedresult bool DEFAULT NULL,
    p_judgescore float8 DEFAULT NULL,
    p_judgeid uuid DEFAULT NULL,
    p_cachekey varchar(500) DEFAULT NULL,
    p_cachehit_clear boolean DEFAULT false,
    p_cachehit bool DEFAULT NULL,
    p_selectionstrategy varchar(50) DEFAULT NULL,
    p_modelpowerrank int4 DEFAULT NULL,
    p_cancellationreason text DEFAULT NULL,
    p_cancelled_clear boolean DEFAULT false,
    p_cancelled bool DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(50) DEFAULT NULL,
    p_modelselection text DEFAULT NULL,
    p_rerunfrompromptrunid uuid DEFAULT NULL,
    p_totalfailoverduration int4 DEFAULT NULL,
    p_originalrequeststarttime timestamptz DEFAULT NULL,
    p_originalmodelid uuid DEFAULT NULL,
    p_failoverdurations text DEFAULT NULL,
    p_failovererrors text DEFAULT NULL,
    p_failoverattempts_clear boolean DEFAULT false,
    p_failoverattempts int4 DEFAULT NULL,
    p_validationsummary text DEFAULT NULL,
    p_validationattempts text DEFAULT NULL,
    p_totalretrydurationms int4 DEFAULT NULL,
    p_lastattemptat timestamptz DEFAULT NULL,
    p_firstattemptat timestamptz DEFAULT NULL,
    p_commonvalidationerror varchar(255) DEFAULT NULL,
    p_validationerrorcount int4 DEFAULT NULL,
    p_finalvalidationerror varchar(500) DEFAULT NULL,
    p_maxretriesconfigured int4 DEFAULT NULL,
    p_retrystrategy varchar(50) DEFAULT NULL,
    p_validationbehavior varchar(50) DEFAULT NULL,
    p_finalvalidationpassed bool DEFAULT NULL,
    p_successfulvalidationcount int4 DEFAULT NULL,
    p_validationattemptcount int4 DEFAULT NULL,
    p_descendantcost numeric(18, 6) DEFAULT NULL,
    p_toplogprobs int4 DEFAULT NULL,
    p_logprobs bool DEFAULT NULL,
    p_responseformat varchar(50) DEFAULT NULL,
    p_stopsequences text DEFAULT NULL,
    p_seed int4 DEFAULT NULL,
    p_presencepenalty numeric(3, 2) DEFAULT NULL,
    p_frequencypenalty numeric(3, 2) DEFAULT NULL,
    p_minp numeric(3, 2) DEFAULT NULL,
    p_topk int4 DEFAULT NULL,
    p_topp numeric(3, 2) DEFAULT NULL,
    p_temperature numeric(3, 2) DEFAULT NULL,
    p_tokenscompletionrollup int4 DEFAULT NULL,
    p_tokenspromptrollup int4 DEFAULT NULL,
    p_tokensusedrollup int4 DEFAULT NULL,
    p_costcurrency varchar(10) DEFAULT NULL,
    p_cost numeric(19, 8) DEFAULT NULL,
    p_agentrunid uuid DEFAULT NULL,
    p_executionorder int4 DEFAULT NULL,
    p_runtype_clear boolean DEFAULT false,
    p_runtype varchar(20) DEFAULT NULL,
    p_parentid uuid DEFAULT NULL,
    p_errormessage text DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success bool DEFAULT NULL,
    p_totalcost numeric(18, 6) DEFAULT NULL,
    p_tokenscompletion int4 DEFAULT NULL,
    p_tokensprompt int4 DEFAULT NULL,
    p_tokensused int4 DEFAULT NULL,
    p_result text DEFAULT NULL,
    p_messages text DEFAULT NULL,
    p_executiontimems int4 DEFAULT NULL,
    p_completedat timestamptz DEFAULT NULL,
    p_runat_clear boolean DEFAULT false,
    p_runat timestamptz DEFAULT NULL,
    p_configurationid uuid DEFAULT NULL,
    p_agentid uuid DEFAULT NULL,
    p_vendorid uuid DEFAULT NULL,
    p_modelid uuid DEFAULT NULL,
    p_promptid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."AIPromptRun" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."AIPromptRun"
        (
            "ID",
            "AssistantPrefill",
                "TestRunID",
                "Comments",
                "RunName",
                "EffortLevel",
                "ModelSpecificResponseDetails",
                "CompletionTime",
                "PromptTime",
                "QueueTime",
                "ChildPromptID",
                "ErrorDetails",
                "FirstTokenTime",
                "StreamingEnabled",
                "WasSelectedResult",
                "JudgeScore",
                "JudgeID",
                "CacheKey",
                "CacheHit",
                "SelectionStrategy",
                "ModelPowerRank",
                "CancellationReason",
                "Cancelled",
                "Status",
                "ModelSelection",
                "RerunFromPromptRunID",
                "TotalFailoverDuration",
                "OriginalRequestStartTime",
                "OriginalModelID",
                "FailoverDurations",
                "FailoverErrors",
                "FailoverAttempts",
                "ValidationSummary",
                "ValidationAttempts",
                "TotalRetryDurationMS",
                "LastAttemptAt",
                "FirstAttemptAt",
                "CommonValidationError",
                "ValidationErrorCount",
                "FinalValidationError",
                "MaxRetriesConfigured",
                "RetryStrategy",
                "ValidationBehavior",
                "FinalValidationPassed",
                "SuccessfulValidationCount",
                "ValidationAttemptCount",
                "DescendantCost",
                "TopLogProbs",
                "LogProbs",
                "ResponseFormat",
                "StopSequences",
                "Seed",
                "PresencePenalty",
                "FrequencyPenalty",
                "MinP",
                "TopK",
                "TopP",
                "Temperature",
                "TokensCompletionRollup",
                "TokensPromptRollup",
                "TokensUsedRollup",
                "CostCurrency",
                "Cost",
                "AgentRunID",
                "ExecutionOrder",
                "RunType",
                "ParentID",
                "ErrorMessage",
                "Success",
                "TotalCost",
                "TokensCompletion",
                "TokensPrompt",
                "TokensUsed",
                "Result",
                "Messages",
                "ExecutionTimeMS",
                "CompletedAt",
                "RunAt",
                "ConfigurationID",
                "AgentID",
                "VendorID",
                "ModelID",
                "PromptID"
        )
    VALUES
        (
            v_new_id,
            p_assistantprefill,
                p_testrunid,
                p_comments,
                p_runname,
                p_effortlevel,
                p_modelspecificresponsedetails,
                p_completiontime,
                p_prompttime,
                p_queuetime,
                p_childpromptid,
                p_errordetails,
                p_firsttokentime,
                CASE WHEN p_streamingenabled_clear = true THEN NULL ELSE COALESCE(p_streamingenabled, false) END,
                CASE WHEN p_wasselectedresult_clear = true THEN NULL ELSE COALESCE(p_wasselectedresult, false) END,
                p_judgescore,
                p_judgeid,
                p_cachekey,
                CASE WHEN p_cachehit_clear = true THEN NULL ELSE COALESCE(p_cachehit, false) END,
                p_selectionstrategy,
                p_modelpowerrank,
                p_cancellationreason,
                CASE WHEN p_cancelled_clear = true THEN NULL ELSE COALESCE(p_cancelled, false) END,
                CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, '''Pending''::character varying') END,
                p_modelselection,
                p_rerunfrompromptrunid,
                p_totalfailoverduration,
                p_originalrequeststarttime,
                p_originalmodelid,
                p_failoverdurations,
                p_failovererrors,
                CASE WHEN p_failoverattempts_clear = true THEN NULL ELSE COALESCE(p_failoverattempts, 0) END,
                p_validationsummary,
                p_validationattempts,
                p_totalretrydurationms,
                p_lastattemptat,
                p_firstattemptat,
                p_commonvalidationerror,
                p_validationerrorcount,
                p_finalvalidationerror,
                p_maxretriesconfigured,
                p_retrystrategy,
                p_validationbehavior,
                p_finalvalidationpassed,
                p_successfulvalidationcount,
                p_validationattemptcount,
                p_descendantcost,
                p_toplogprobs,
                p_logprobs,
                p_responseformat,
                p_stopsequences,
                p_seed,
                p_presencepenalty,
                p_frequencypenalty,
                p_minp,
                p_topk,
                p_topp,
                p_temperature,
                p_tokenscompletionrollup,
                p_tokenspromptrollup,
                p_tokensusedrollup,
                p_costcurrency,
                p_cost,
                p_agentrunid,
                p_executionorder,
                CASE WHEN p_runtype_clear = true THEN NULL ELSE COALESCE(p_runtype, '''Single''::character varying') END,
                p_parentid,
                p_errormessage,
                CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, false) END,
                p_totalcost,
                p_tokenscompletion,
                p_tokensprompt,
                p_tokensused,
                p_result,
                p_messages,
                p_executiontimems,
                p_completedat,
                CASE WHEN p_runat_clear = true THEN NULL ELSE COALESCE(p_runat, NOW()) END,
                p_configurationid,
                p_agentid,
                p_vendorid,
                p_modelid,
                p_promptid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwAIPromptRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateAIPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateAIPromptRun
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPromptRun'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateAIPromptRun"(
    p_assistantprefill text DEFAULT NULL,
    p_testrunid uuid DEFAULT NULL,
    p_comments text DEFAULT NULL,
    p_runname varchar(255) DEFAULT NULL,
    p_effortlevel int4 DEFAULT NULL,
    p_modelspecificresponsedetails text DEFAULT NULL,
    p_completiontime int4 DEFAULT NULL,
    p_prompttime int4 DEFAULT NULL,
    p_queuetime int4 DEFAULT NULL,
    p_childpromptid uuid DEFAULT NULL,
    p_errordetails text DEFAULT NULL,
    p_firsttokentime int4 DEFAULT NULL,
    p_streamingenabled_clear boolean DEFAULT false,
    p_streamingenabled bool DEFAULT NULL,
    p_wasselectedresult_clear boolean DEFAULT false,
    p_wasselectedresult bool DEFAULT NULL,
    p_judgescore float8 DEFAULT NULL,
    p_judgeid uuid DEFAULT NULL,
    p_cachekey varchar(500) DEFAULT NULL,
    p_cachehit_clear boolean DEFAULT false,
    p_cachehit bool DEFAULT NULL,
    p_selectionstrategy varchar(50) DEFAULT NULL,
    p_modelpowerrank int4 DEFAULT NULL,
    p_cancellationreason text DEFAULT NULL,
    p_cancelled_clear boolean DEFAULT false,
    p_cancelled bool DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(50) DEFAULT NULL,
    p_modelselection text DEFAULT NULL,
    p_rerunfrompromptrunid uuid DEFAULT NULL,
    p_totalfailoverduration int4 DEFAULT NULL,
    p_originalrequeststarttime timestamptz DEFAULT NULL,
    p_originalmodelid uuid DEFAULT NULL,
    p_failoverdurations text DEFAULT NULL,
    p_failovererrors text DEFAULT NULL,
    p_failoverattempts_clear boolean DEFAULT false,
    p_failoverattempts int4 DEFAULT NULL,
    p_validationsummary text DEFAULT NULL,
    p_validationattempts text DEFAULT NULL,
    p_totalretrydurationms int4 DEFAULT NULL,
    p_lastattemptat timestamptz DEFAULT NULL,
    p_firstattemptat timestamptz DEFAULT NULL,
    p_commonvalidationerror varchar(255) DEFAULT NULL,
    p_validationerrorcount int4 DEFAULT NULL,
    p_finalvalidationerror varchar(500) DEFAULT NULL,
    p_maxretriesconfigured int4 DEFAULT NULL,
    p_retrystrategy varchar(50) DEFAULT NULL,
    p_validationbehavior varchar(50) DEFAULT NULL,
    p_finalvalidationpassed bool DEFAULT NULL,
    p_successfulvalidationcount int4 DEFAULT NULL,
    p_validationattemptcount int4 DEFAULT NULL,
    p_descendantcost numeric(18, 6) DEFAULT NULL,
    p_toplogprobs int4 DEFAULT NULL,
    p_logprobs bool DEFAULT NULL,
    p_responseformat varchar(50) DEFAULT NULL,
    p_stopsequences text DEFAULT NULL,
    p_seed int4 DEFAULT NULL,
    p_presencepenalty numeric(3, 2) DEFAULT NULL,
    p_frequencypenalty numeric(3, 2) DEFAULT NULL,
    p_minp numeric(3, 2) DEFAULT NULL,
    p_topk int4 DEFAULT NULL,
    p_topp numeric(3, 2) DEFAULT NULL,
    p_temperature numeric(3, 2) DEFAULT NULL,
    p_tokenscompletionrollup int4 DEFAULT NULL,
    p_tokenspromptrollup int4 DEFAULT NULL,
    p_tokensusedrollup int4 DEFAULT NULL,
    p_costcurrency varchar(10) DEFAULT NULL,
    p_cost numeric(19, 8) DEFAULT NULL,
    p_agentrunid uuid DEFAULT NULL,
    p_executionorder int4 DEFAULT NULL,
    p_runtype_clear boolean DEFAULT false,
    p_runtype varchar(20) DEFAULT NULL,
    p_parentid uuid DEFAULT NULL,
    p_errormessage text DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success bool DEFAULT NULL,
    p_totalcost numeric(18, 6) DEFAULT NULL,
    p_tokenscompletion int4 DEFAULT NULL,
    p_tokensprompt int4 DEFAULT NULL,
    p_tokensused int4 DEFAULT NULL,
    p_result text DEFAULT NULL,
    p_messages text DEFAULT NULL,
    p_executiontimems int4 DEFAULT NULL,
    p_completedat timestamptz DEFAULT NULL,
    p_runat_clear boolean DEFAULT false,
    p_runat timestamptz DEFAULT NULL,
    p_configurationid uuid DEFAULT NULL,
    p_agentid uuid DEFAULT NULL,
    p_vendorid uuid DEFAULT NULL,
    p_modelid uuid DEFAULT NULL,
    p_promptid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."AIPromptRun" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."AIPromptRun"
    SET
        "AssistantPrefill" = COALESCE(p_assistantprefill, "AssistantPrefill"),
        "TestRunID" = COALESCE(p_testrunid, "TestRunID"),
        "Comments" = COALESCE(p_comments, "Comments"),
        "RunName" = COALESCE(p_runname, "RunName"),
        "EffortLevel" = COALESCE(p_effortlevel, "EffortLevel"),
        "ModelSpecificResponseDetails" = COALESCE(p_modelspecificresponsedetails, "ModelSpecificResponseDetails"),
        "CompletionTime" = COALESCE(p_completiontime, "CompletionTime"),
        "PromptTime" = COALESCE(p_prompttime, "PromptTime"),
        "QueueTime" = COALESCE(p_queuetime, "QueueTime"),
        "ChildPromptID" = COALESCE(p_childpromptid, "ChildPromptID"),
        "ErrorDetails" = COALESCE(p_errordetails, "ErrorDetails"),
        "FirstTokenTime" = COALESCE(p_firsttokentime, "FirstTokenTime"),
        "StreamingEnabled" = CASE WHEN p_streamingenabled_clear = true THEN NULL ELSE COALESCE(p_streamingenabled, "StreamingEnabled") END,
        "WasSelectedResult" = CASE WHEN p_wasselectedresult_clear = true THEN NULL ELSE COALESCE(p_wasselectedresult, "WasSelectedResult") END,
        "JudgeScore" = COALESCE(p_judgescore, "JudgeScore"),
        "JudgeID" = COALESCE(p_judgeid, "JudgeID"),
        "CacheKey" = COALESCE(p_cachekey, "CacheKey"),
        "CacheHit" = CASE WHEN p_cachehit_clear = true THEN NULL ELSE COALESCE(p_cachehit, "CacheHit") END,
        "SelectionStrategy" = COALESCE(p_selectionstrategy, "SelectionStrategy"),
        "ModelPowerRank" = COALESCE(p_modelpowerrank, "ModelPowerRank"),
        "CancellationReason" = COALESCE(p_cancellationreason, "CancellationReason"),
        "Cancelled" = CASE WHEN p_cancelled_clear = true THEN NULL ELSE COALESCE(p_cancelled, "Cancelled") END,
        "Status" = CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, "Status") END,
        "ModelSelection" = COALESCE(p_modelselection, "ModelSelection"),
        "RerunFromPromptRunID" = COALESCE(p_rerunfrompromptrunid, "RerunFromPromptRunID"),
        "TotalFailoverDuration" = COALESCE(p_totalfailoverduration, "TotalFailoverDuration"),
        "OriginalRequestStartTime" = COALESCE(p_originalrequeststarttime, "OriginalRequestStartTime"),
        "OriginalModelID" = COALESCE(p_originalmodelid, "OriginalModelID"),
        "FailoverDurations" = COALESCE(p_failoverdurations, "FailoverDurations"),
        "FailoverErrors" = COALESCE(p_failovererrors, "FailoverErrors"),
        "FailoverAttempts" = CASE WHEN p_failoverattempts_clear = true THEN NULL ELSE COALESCE(p_failoverattempts, "FailoverAttempts") END,
        "ValidationSummary" = COALESCE(p_validationsummary, "ValidationSummary"),
        "ValidationAttempts" = COALESCE(p_validationattempts, "ValidationAttempts"),
        "TotalRetryDurationMS" = COALESCE(p_totalretrydurationms, "TotalRetryDurationMS"),
        "LastAttemptAt" = COALESCE(p_lastattemptat, "LastAttemptAt"),
        "FirstAttemptAt" = COALESCE(p_firstattemptat, "FirstAttemptAt"),
        "CommonValidationError" = COALESCE(p_commonvalidationerror, "CommonValidationError"),
        "ValidationErrorCount" = COALESCE(p_validationerrorcount, "ValidationErrorCount"),
        "FinalValidationError" = COALESCE(p_finalvalidationerror, "FinalValidationError"),
        "MaxRetriesConfigured" = COALESCE(p_maxretriesconfigured, "MaxRetriesConfigured"),
        "RetryStrategy" = COALESCE(p_retrystrategy, "RetryStrategy"),
        "ValidationBehavior" = COALESCE(p_validationbehavior, "ValidationBehavior"),
        "FinalValidationPassed" = COALESCE(p_finalvalidationpassed, "FinalValidationPassed"),
        "SuccessfulValidationCount" = COALESCE(p_successfulvalidationcount, "SuccessfulValidationCount"),
        "ValidationAttemptCount" = COALESCE(p_validationattemptcount, "ValidationAttemptCount"),
        "DescendantCost" = COALESCE(p_descendantcost, "DescendantCost"),
        "TopLogProbs" = COALESCE(p_toplogprobs, "TopLogProbs"),
        "LogProbs" = COALESCE(p_logprobs, "LogProbs"),
        "ResponseFormat" = COALESCE(p_responseformat, "ResponseFormat"),
        "StopSequences" = COALESCE(p_stopsequences, "StopSequences"),
        "Seed" = COALESCE(p_seed, "Seed"),
        "PresencePenalty" = COALESCE(p_presencepenalty, "PresencePenalty"),
        "FrequencyPenalty" = COALESCE(p_frequencypenalty, "FrequencyPenalty"),
        "MinP" = COALESCE(p_minp, "MinP"),
        "TopK" = COALESCE(p_topk, "TopK"),
        "TopP" = COALESCE(p_topp, "TopP"),
        "Temperature" = COALESCE(p_temperature, "Temperature"),
        "TokensCompletionRollup" = COALESCE(p_tokenscompletionrollup, "TokensCompletionRollup"),
        "TokensPromptRollup" = COALESCE(p_tokenspromptrollup, "TokensPromptRollup"),
        "TokensUsedRollup" = COALESCE(p_tokensusedrollup, "TokensUsedRollup"),
        "CostCurrency" = COALESCE(p_costcurrency, "CostCurrency"),
        "Cost" = COALESCE(p_cost, "Cost"),
        "AgentRunID" = COALESCE(p_agentrunid, "AgentRunID"),
        "ExecutionOrder" = COALESCE(p_executionorder, "ExecutionOrder"),
        "RunType" = CASE WHEN p_runtype_clear = true THEN NULL ELSE COALESCE(p_runtype, "RunType") END,
        "ParentID" = COALESCE(p_parentid, "ParentID"),
        "ErrorMessage" = COALESCE(p_errormessage, "ErrorMessage"),
        "Success" = CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, "Success") END,
        "TotalCost" = COALESCE(p_totalcost, "TotalCost"),
        "TokensCompletion" = COALESCE(p_tokenscompletion, "TokensCompletion"),
        "TokensPrompt" = COALESCE(p_tokensprompt, "TokensPrompt"),
        "TokensUsed" = COALESCE(p_tokensused, "TokensUsed"),
        "Result" = COALESCE(p_result, "Result"),
        "Messages" = COALESCE(p_messages, "Messages"),
        "ExecutionTimeMS" = COALESCE(p_executiontimems, "ExecutionTimeMS"),
        "CompletedAt" = COALESCE(p_completedat, "CompletedAt"),
        "RunAt" = CASE WHEN p_runat_clear = true THEN NULL ELSE COALESCE(p_runat, "RunAt") END,
        "ConfigurationID" = COALESCE(p_configurationid, "ConfigurationID"),
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "VendorID" = COALESCE(p_vendorid, "VendorID"),
        "ModelID" = COALESCE(p_modelid, "ModelID"),
        "PromptID" = COALESCE(p_promptid, "PromptID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwAIPromptRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateAIPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateConversationDetail
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationDetail'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateConversationDetail"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_ExternalID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalID VARCHAR(100) DEFAULT NULL,
    IN p_Role VARCHAR(20) DEFAULT NULL,
    IN p_Message TEXT DEFAULT NULL,
    IN p_Error_Clear BOOLEAN DEFAULT FALSE,
    IN p_Error TEXT DEFAULT NULL,
    IN p_HiddenToUser BOOLEAN DEFAULT NULL,
    IN p_UserRating_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserRating INTEGER DEFAULT NULL,
    IN p_UserFeedback_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserFeedback TEXT DEFAULT NULL,
    IN p_ReflectionInsights_Clear BOOLEAN DEFAULT FALSE,
    IN p_ReflectionInsights TEXT DEFAULT NULL,
    IN p_SummaryOfEarlierConversation_Clear BOOLEAN DEFAULT FALSE,
    IN p_SummaryOfEarlierConversation TEXT DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_ArtifactID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactID UUID DEFAULT NULL,
    IN p_ArtifactVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_CompletionTime_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletionTime BIGINT DEFAULT NULL,
    IN p_IsPinned BOOLEAN DEFAULT NULL,
    IN p_ParentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_AgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SuggestedResponses_Clear BOOLEAN DEFAULT FALSE,
    IN p_SuggestedResponses TEXT DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_ResponseForm_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseForm TEXT DEFAULT NULL,
    IN p_ActionableCommands_Clear BOOLEAN DEFAULT FALSE,
    IN p_ActionableCommands TEXT DEFAULT NULL,
    IN p_AutomaticCommands_Clear BOOLEAN DEFAULT FALSE,
    IN p_AutomaticCommands TEXT DEFAULT NULL,
    IN p_OriginalMessageChanged BOOLEAN DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."ConversationDetail" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO ${flyway:defaultSchema}."ConversationDetail"
            (
                "ID",
                "ConversationID",
                "ExternalID",
                "Role",
                "Message",
                "Error",
                "HiddenToUser",
                "UserRating",
                "UserFeedback",
                "ReflectionInsights",
                "SummaryOfEarlierConversation",
                "UserID",
                "ArtifactID",
                "ArtifactVersionID",
                "CompletionTime",
                "IsPinned",
                "ParentID",
                "AgentID",
                "Status",
                "SuggestedResponses",
                "TestRunID",
                "ResponseForm",
                "ActionableCommands",
                "AutomaticCommands",
                "OriginalMessageChanged"
            )
        VALUES
            (
                p_ID,
                p_ConversationID,
                CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, NULL) END,
                COALESCE(p_Role, current_user),
                p_Message,
                CASE WHEN p_Error_Clear = TRUE THEN NULL ELSE COALESCE(p_Error, NULL) END,
                COALESCE(p_HiddenToUser, FALSE),
                CASE WHEN p_UserRating_Clear = TRUE THEN NULL ELSE COALESCE(p_UserRating, NULL) END,
                CASE WHEN p_UserFeedback_Clear = TRUE THEN NULL ELSE COALESCE(p_UserFeedback, NULL) END,
                CASE WHEN p_ReflectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ReflectionInsights, NULL) END,
                CASE WHEN p_SummaryOfEarlierConversation_Clear = TRUE THEN NULL ELSE COALESCE(p_SummaryOfEarlierConversation, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_ArtifactID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactID, NULL) END,
                CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, NULL) END,
                CASE WHEN p_CompletionTime_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletionTime, NULL) END,
                COALESCE(p_IsPinned, FALSE),
                CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, NULL) END,
                CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, NULL) END,
                COALESCE(p_Status, 'Complete'),
                CASE WHEN p_SuggestedResponses_Clear = TRUE THEN NULL ELSE COALESCE(p_SuggestedResponses, NULL) END,
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END,
                CASE WHEN p_ResponseForm_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseForm, NULL) END,
                CASE WHEN p_ActionableCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_ActionableCommands, NULL) END,
                CASE WHEN p_AutomaticCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_AutomaticCommands, NULL) END,
                COALESCE(p_OriginalMessageChanged, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO ${flyway:defaultSchema}."ConversationDetail"
            (
                "ConversationID",
                "ExternalID",
                "Role",
                "Message",
                "Error",
                "HiddenToUser",
                "UserRating",
                "UserFeedback",
                "ReflectionInsights",
                "SummaryOfEarlierConversation",
                "UserID",
                "ArtifactID",
                "ArtifactVersionID",
                "CompletionTime",
                "IsPinned",
                "ParentID",
                "AgentID",
                "Status",
                "SuggestedResponses",
                "TestRunID",
                "ResponseForm",
                "ActionableCommands",
                "AutomaticCommands",
                "OriginalMessageChanged"
            )
        VALUES
            (
                p_ConversationID,
                CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, NULL) END,
                COALESCE(p_Role, current_user),
                p_Message,
                CASE WHEN p_Error_Clear = TRUE THEN NULL ELSE COALESCE(p_Error, NULL) END,
                COALESCE(p_HiddenToUser, FALSE),
                CASE WHEN p_UserRating_Clear = TRUE THEN NULL ELSE COALESCE(p_UserRating, NULL) END,
                CASE WHEN p_UserFeedback_Clear = TRUE THEN NULL ELSE COALESCE(p_UserFeedback, NULL) END,
                CASE WHEN p_ReflectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ReflectionInsights, NULL) END,
                CASE WHEN p_SummaryOfEarlierConversation_Clear = TRUE THEN NULL ELSE COALESCE(p_SummaryOfEarlierConversation, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_ArtifactID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactID, NULL) END,
                CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, NULL) END,
                CASE WHEN p_CompletionTime_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletionTime, NULL) END,
                COALESCE(p_IsPinned, FALSE),
                CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, NULL) END,
                CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, NULL) END,
                COALESCE(p_Status, 'Complete'),
                CASE WHEN p_SuggestedResponses_Clear = TRUE THEN NULL ELSE COALESCE(p_SuggestedResponses, NULL) END,
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END,
                CASE WHEN p_ResponseForm_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseForm, NULL) END,
                CASE WHEN p_ActionableCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_ActionableCommands, NULL) END,
                CASE WHEN p_AutomaticCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_AutomaticCommands, NULL) END,
                COALESCE(p_OriginalMessageChanged, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."ConversationDetail" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateConversationDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateConversationDetail
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationDetail'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateConversationDetail"(
    IN p_ID UUID,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_ExternalID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalID VARCHAR(100) DEFAULT NULL,
    IN p_Role VARCHAR(20) DEFAULT NULL,
    IN p_Message TEXT DEFAULT NULL,
    IN p_Error_Clear BOOLEAN DEFAULT FALSE,
    IN p_Error TEXT DEFAULT NULL,
    IN p_HiddenToUser BOOLEAN DEFAULT NULL,
    IN p_UserRating_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserRating INTEGER DEFAULT NULL,
    IN p_UserFeedback_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserFeedback TEXT DEFAULT NULL,
    IN p_ReflectionInsights_Clear BOOLEAN DEFAULT FALSE,
    IN p_ReflectionInsights TEXT DEFAULT NULL,
    IN p_SummaryOfEarlierConversation_Clear BOOLEAN DEFAULT FALSE,
    IN p_SummaryOfEarlierConversation TEXT DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_ArtifactID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactID UUID DEFAULT NULL,
    IN p_ArtifactVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_CompletionTime_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletionTime BIGINT DEFAULT NULL,
    IN p_IsPinned BOOLEAN DEFAULT NULL,
    IN p_ParentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_AgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SuggestedResponses_Clear BOOLEAN DEFAULT FALSE,
    IN p_SuggestedResponses TEXT DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_ResponseForm_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseForm TEXT DEFAULT NULL,
    IN p_ActionableCommands_Clear BOOLEAN DEFAULT FALSE,
    IN p_ActionableCommands TEXT DEFAULT NULL,
    IN p_AutomaticCommands_Clear BOOLEAN DEFAULT FALSE,
    IN p_AutomaticCommands TEXT DEFAULT NULL,
    IN p_OriginalMessageChanged BOOLEAN DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."ConversationDetail" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        ${flyway:defaultSchema}."ConversationDetail"
    SET
        "ConversationID" = COALESCE(p_ConversationID, "ConversationID"),
        "ExternalID" = CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, "ExternalID") END,
        "Role" = COALESCE(p_Role, "Role"),
        "Message" = COALESCE(p_Message, "Message"),
        "Error" = CASE WHEN p_Error_Clear = TRUE THEN NULL ELSE COALESCE(p_Error, "Error") END,
        "HiddenToUser" = COALESCE(p_HiddenToUser, "HiddenToUser"),
        "UserRating" = CASE WHEN p_UserRating_Clear = TRUE THEN NULL ELSE COALESCE(p_UserRating, "UserRating") END,
        "UserFeedback" = CASE WHEN p_UserFeedback_Clear = TRUE THEN NULL ELSE COALESCE(p_UserFeedback, "UserFeedback") END,
        "ReflectionInsights" = CASE WHEN p_ReflectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ReflectionInsights, "ReflectionInsights") END,
        "SummaryOfEarlierConversation" = CASE WHEN p_SummaryOfEarlierConversation_Clear = TRUE THEN NULL ELSE COALESCE(p_SummaryOfEarlierConversation, "SummaryOfEarlierConversation") END,
        "UserID" = CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, "UserID") END,
        "ArtifactID" = CASE WHEN p_ArtifactID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactID, "ArtifactID") END,
        "ArtifactVersionID" = CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, "ArtifactVersionID") END,
        "CompletionTime" = CASE WHEN p_CompletionTime_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletionTime, "CompletionTime") END,
        "IsPinned" = COALESCE(p_IsPinned, "IsPinned"),
        "ParentID" = CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, "ParentID") END,
        "AgentID" = CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, "AgentID") END,
        "Status" = COALESCE(p_Status, "Status"),
        "SuggestedResponses" = CASE WHEN p_SuggestedResponses_Clear = TRUE THEN NULL ELSE COALESCE(p_SuggestedResponses, "SuggestedResponses") END,
        "TestRunID" = CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, "TestRunID") END,
        "ResponseForm" = CASE WHEN p_ResponseForm_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseForm, "ResponseForm") END,
        "ActionableCommands" = CASE WHEN p_ActionableCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_ActionableCommands, "ActionableCommands") END,
        "AutomaticCommands" = CASE WHEN p_AutomaticCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_AutomaticCommands, "AutomaticCommands") END,
        "OriginalMessageChanged" = COALESCE(p_OriginalMessageChanged, "OriginalMessageChanged")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."ConversationDetail" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."ConversationDetail" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateConversationDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateConversation
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversation'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateConversation"(
    IN p_ID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_ExternalID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalID VARCHAR(500) DEFAULT NULL,
    IN p_Name_Clear BOOLEAN DEFAULT FALSE,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Type VARCHAR(50) DEFAULT NULL,
    IN p_IsArchived BOOLEAN DEFAULT NULL,
    IN p_LinkedEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedEntityID UUID DEFAULT NULL,
    IN p_LinkedRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedRecordID VARCHAR(500) DEFAULT NULL,
    IN p_DataContextID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DataContextID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_EnvironmentID UUID DEFAULT NULL,
    IN p_ProjectID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ProjectID UUID DEFAULT NULL,
    IN p_IsPinned BOOLEAN DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."Conversation" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO ${flyway:defaultSchema}."Conversation"
            (
                "ID",
                "UserID",
                "ExternalID",
                "Name",
                "Description",
                "Type",
                "IsArchived",
                "LinkedEntityID",
                "LinkedRecordID",
                "DataContextID",
                "Status",
                "EnvironmentID",
                "ProjectID",
                "IsPinned",
                "TestRunID"
            )
        VALUES
            (
                p_ID,
                p_UserID,
                CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, NULL) END,
                CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Type, 'Skip'),
                COALESCE(p_IsArchived, FALSE),
                CASE WHEN p_LinkedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedEntityID, NULL) END,
                CASE WHEN p_LinkedRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedRecordID, NULL) END,
                CASE WHEN p_DataContextID_Clear = TRUE THEN NULL ELSE COALESCE(p_DataContextID, NULL) END,
                COALESCE(p_Status, 'Available'),
                CASE WHEN p_EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN p_ProjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_ProjectID, NULL) END,
                COALESCE(p_IsPinned, FALSE),
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO ${flyway:defaultSchema}."Conversation"
            (
                "UserID",
                "ExternalID",
                "Name",
                "Description",
                "Type",
                "IsArchived",
                "LinkedEntityID",
                "LinkedRecordID",
                "DataContextID",
                "Status",
                "EnvironmentID",
                "ProjectID",
                "IsPinned",
                "TestRunID"
            )
        VALUES
            (
                p_UserID,
                CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, NULL) END,
                CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Type, 'Skip'),
                COALESCE(p_IsArchived, FALSE),
                CASE WHEN p_LinkedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedEntityID, NULL) END,
                CASE WHEN p_LinkedRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedRecordID, NULL) END,
                CASE WHEN p_DataContextID_Clear = TRUE THEN NULL ELSE COALESCE(p_DataContextID, NULL) END,
                COALESCE(p_Status, 'Available'),
                CASE WHEN p_EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN p_ProjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_ProjectID, NULL) END,
                COALESCE(p_IsPinned, FALSE),
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."Conversation" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateConversation" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateConversation
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversation'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateConversation"(
    IN p_ID UUID,
    IN p_UserID UUID DEFAULT NULL,
    IN p_ExternalID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalID VARCHAR(500) DEFAULT NULL,
    IN p_Name_Clear BOOLEAN DEFAULT FALSE,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Type VARCHAR(50) DEFAULT NULL,
    IN p_IsArchived BOOLEAN DEFAULT NULL,
    IN p_LinkedEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedEntityID UUID DEFAULT NULL,
    IN p_LinkedRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedRecordID VARCHAR(500) DEFAULT NULL,
    IN p_DataContextID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DataContextID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_EnvironmentID UUID DEFAULT NULL,
    IN p_ProjectID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ProjectID UUID DEFAULT NULL,
    IN p_IsPinned BOOLEAN DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."Conversation" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        ${flyway:defaultSchema}."Conversation"
    SET
        "UserID" = COALESCE(p_UserID, "UserID"),
        "ExternalID" = CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, "ExternalID") END,
        "Name" = CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, "Name") END,
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "Type" = COALESCE(p_Type, "Type"),
        "IsArchived" = COALESCE(p_IsArchived, "IsArchived"),
        "LinkedEntityID" = CASE WHEN p_LinkedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedEntityID, "LinkedEntityID") END,
        "LinkedRecordID" = CASE WHEN p_LinkedRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedRecordID, "LinkedRecordID") END,
        "DataContextID" = CASE WHEN p_DataContextID_Clear = TRUE THEN NULL ELSE COALESCE(p_DataContextID, "DataContextID") END,
        "Status" = COALESCE(p_Status, "Status"),
        "EnvironmentID" = COALESCE(p_EnvironmentID, "EnvironmentID"),
        "ProjectID" = CASE WHEN p_ProjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_ProjectID, "ProjectID") END,
        "IsPinned" = COALESCE(p_IsPinned, "IsPinned"),
        "TestRunID" = CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, "TestRunID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."Conversation" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."Conversation" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateConversation" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateTestRunFeedback
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTestRunFeedback'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateTestRunFeedback"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_ReviewerUserID UUID DEFAULT NULL,
    IN p_Rating_Clear BOOLEAN DEFAULT FALSE,
    IN p_Rating INTEGER DEFAULT NULL,
    IN p_IsCorrect_Clear BOOLEAN DEFAULT FALSE,
    IN p_IsCorrect BOOLEAN DEFAULT NULL,
    IN p_CorrectionSummary_Clear BOOLEAN DEFAULT FALSE,
    IN p_CorrectionSummary TEXT DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_ReviewedAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."TestRunFeedback" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO ${flyway:defaultSchema}."TestRunFeedback"
            (
                "ID",
                "TestRunID",
                "ReviewerUserID",
                "Rating",
                "IsCorrect",
                "CorrectionSummary",
                "Comments",
                "ReviewedAt"
            )
        VALUES
            (
                p_ID,
                p_TestRunID,
                p_ReviewerUserID,
                CASE WHEN p_Rating_Clear = TRUE THEN NULL ELSE COALESCE(p_Rating, NULL) END,
                CASE WHEN p_IsCorrect_Clear = TRUE THEN NULL ELSE COALESCE(p_IsCorrect, NULL) END,
                CASE WHEN p_CorrectionSummary_Clear = TRUE THEN NULL ELSE COALESCE(p_CorrectionSummary, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                COALESCE(p_ReviewedAt, NOW())
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO ${flyway:defaultSchema}."TestRunFeedback"
            (
                "TestRunID",
                "ReviewerUserID",
                "Rating",
                "IsCorrect",
                "CorrectionSummary",
                "Comments",
                "ReviewedAt"
            )
        VALUES
            (
                p_TestRunID,
                p_ReviewerUserID,
                CASE WHEN p_Rating_Clear = TRUE THEN NULL ELSE COALESCE(p_Rating, NULL) END,
                CASE WHEN p_IsCorrect_Clear = TRUE THEN NULL ELSE COALESCE(p_IsCorrect, NULL) END,
                CASE WHEN p_CorrectionSummary_Clear = TRUE THEN NULL ELSE COALESCE(p_CorrectionSummary, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                COALESCE(p_ReviewedAt, NOW())
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."TestRunFeedback" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateTestRunFeedback" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateTestRunFeedback
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTestRunFeedback'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateTestRunFeedback"(
    IN p_ID UUID,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_ReviewerUserID UUID DEFAULT NULL,
    IN p_Rating_Clear BOOLEAN DEFAULT FALSE,
    IN p_Rating INTEGER DEFAULT NULL,
    IN p_IsCorrect_Clear BOOLEAN DEFAULT FALSE,
    IN p_IsCorrect BOOLEAN DEFAULT NULL,
    IN p_CorrectionSummary_Clear BOOLEAN DEFAULT FALSE,
    IN p_CorrectionSummary TEXT DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_ReviewedAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."TestRunFeedback" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        ${flyway:defaultSchema}."TestRunFeedback"
    SET
        "TestRunID" = COALESCE(p_TestRunID, "TestRunID"),
        "ReviewerUserID" = COALESCE(p_ReviewerUserID, "ReviewerUserID"),
        "Rating" = CASE WHEN p_Rating_Clear = TRUE THEN NULL ELSE COALESCE(p_Rating, "Rating") END,
        "IsCorrect" = CASE WHEN p_IsCorrect_Clear = TRUE THEN NULL ELSE COALESCE(p_IsCorrect, "IsCorrect") END,
        "CorrectionSummary" = CASE WHEN p_CorrectionSummary_Clear = TRUE THEN NULL ELSE COALESCE(p_CorrectionSummary, "CorrectionSummary") END,
        "Comments" = CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, "Comments") END,
        "ReviewedAt" = COALESCE(p_ReviewedAt, "ReviewedAt")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."TestRunFeedback" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."TestRunFeedback" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateTestRunFeedback" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spCreateTestRunOutput
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTestRunOutput'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateTestRunOutput"(
    p_metadata text DEFAULT NULL,
    p_durationseconds numeric(10, 3) DEFAULT NULL,
    p_height int4 DEFAULT NULL,
    p_width int4 DEFAULT NULL,
    p_filesizebytes int4 DEFAULT NULL,
    p_inlinedata text DEFAULT NULL,
    p_mimetype varchar(100) DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_stepnumber int4 DEFAULT NULL,
    p_sequence_clear boolean DEFAULT false,
    p_sequence int4 DEFAULT NULL,
    p_outputtypeid uuid DEFAULT NULL,
    p_testrunid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."TestRunOutput" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."TestRunOutput"
        (
            "ID",
            "Metadata",
                "DurationSeconds",
                "Height",
                "Width",
                "FileSizeBytes",
                "InlineData",
                "MimeType",
                "Description",
                "Name",
                "StepNumber",
                "Sequence",
                "OutputTypeID",
                "TestRunID"
        )
    VALUES
        (
            v_new_id,
            p_metadata,
                p_durationseconds,
                p_height,
                p_width,
                p_filesizebytes,
                p_inlinedata,
                p_mimetype,
                p_description,
                p_name,
                p_stepnumber,
                CASE WHEN p_sequence_clear = true THEN NULL ELSE COALESCE(p_sequence, 0) END,
                p_outputtypeid,
                p_testrunid
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwTestRunOutputs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateTestRunOutput" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- spUpdateTestRunOutput
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTestRunOutput'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text || ' CASCADE';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateTestRunOutput"(
    p_metadata text DEFAULT NULL,
    p_durationseconds numeric(10, 3) DEFAULT NULL,
    p_height int4 DEFAULT NULL,
    p_width int4 DEFAULT NULL,
    p_filesizebytes int4 DEFAULT NULL,
    p_inlinedata text DEFAULT NULL,
    p_mimetype varchar(100) DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_stepnumber int4 DEFAULT NULL,
    p_sequence_clear boolean DEFAULT false,
    p_sequence int4 DEFAULT NULL,
    p_outputtypeid uuid DEFAULT NULL,
    p_testrunid uuid DEFAULT NULL,
    p_id uuid DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."TestRunOutput" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."TestRunOutput"
    SET
        "Metadata" = COALESCE(p_metadata, "Metadata"),
        "DurationSeconds" = COALESCE(p_durationseconds, "DurationSeconds"),
        "Height" = COALESCE(p_height, "Height"),
        "Width" = COALESCE(p_width, "Width"),
        "FileSizeBytes" = COALESCE(p_filesizebytes, "FileSizeBytes"),
        "InlineData" = COALESCE(p_inlinedata, "InlineData"),
        "MimeType" = COALESCE(p_mimetype, "MimeType"),
        "Description" = COALESCE(p_description, "Description"),
        "Name" = COALESCE(p_name, "Name"),
        "StepNumber" = COALESCE(p_stepnumber, "StepNumber"),
        "Sequence" = CASE WHEN p_sequence_clear = true THEN NULL ELSE COALESCE(p_sequence, "Sequence") END,
        "OutputTypeID" = COALESCE(p_outputtypeid, "OutputTypeID"),
        "TestRunID" = COALESCE(p_testrunid, "TestRunID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwTestRunOutputs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;


DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateTestRunOutput" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;

