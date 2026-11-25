-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610261530__v6.2.x__CodeGen_EntityField_Drift_Repairs.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The transpiler reported the table-variable repair (part 1) and both CREATE OR ALTER PROCs as
-- unhandled. The SQL Server migration has three parts (#6028, #4050, #4569, #3546):
--
--  1. #6028 — the four virtual `EntityAction` EntityField rows: ported below as a set-based UPDATE
--     and DELETE over the same four entity IDs (the T-SQL table variable becomes an IN list).
--
--  2. spUpdateExistingEntityFieldsFromSchema (#4569 IS-A inherited rows, #4050 orphan-tolerant
--     renumber): NOT in this file by design. On PostgreSQL this routine is CodeGen output
--     (packages/CodeGenLib/src/Database/providers/postgresql/metadataSupportObjects.ts), and the same
--     change (6770aadf41) added both fixes there. Same reasoning as V202608260829 Heal_SPs_IncludedSchemaNames.
--
--  3. spDeleteEntityWithCoreDependencies (#3546): hand-ported below from the T-SQL body, keeping the
--     PostgreSQL signature (p_EntityID uuid) RETURNS SETOF record that CodeGen calls with PERFORM
--     (PostgreSQLCodeGenProvider.callRoutineSQL). Translation:
--       * the @Handled list becomes v_handled; the sys.foreign_keys dynamic probe becomes the
--         pg_constraint probe V202609142100 already used (NO ACTION / RESTRICT only);
--       * each `DECLARE @X TABLE … INSERT INTO @X SELECT ID …` becomes a uuid[] captured with
--         ARRAY(SELECT "ID" …) before any delete, and `IN (SELECT ID FROM @X)` becomes `= ANY (v_X)`;
--       * BEGIN TRANSACTION / TRY / CATCH / XACT_ABORT are dropped: an error anywhere in a plpgsql
--         function rolls back every statement the call ran, so the entity is never half-pruned;
--       * GETUTCDATE() becomes NOW(). Statement order is unchanged (children before parents).
-- ╚════════════════════════════════════════╝

-- ── 1. #6028: drop the re-inserted virtual EntityAction fields ──────────────────────────────
-- Targeted by (EntityID, Name, IsVirtual) rather than by EntityField.ID: on databases where CodeGen
-- created these rows the IDs differ.
-- The flag that makes CodeGen request the column; V202608082130 cleared it, repeated here so a
-- database that re-enabled it does not recreate the row on its next CodeGen run.
UPDATE __mj."EntityField"
   SET "IncludeRelatedEntityNameFieldInBaseView" = FALSE
 WHERE "EntityID" IN ('3E248F34-2837-EF11-86D4-6045BDEE16E6',   -- MJ: Action Execution Logs
                      '39248F34-2837-EF11-86D4-6045BDEE16E6',   -- MJ: Entity Action Filters
                      '35248F34-2837-EF11-86D4-6045BDEE16E6',   -- MJ: Entity Action Invocations
                      '56248F34-2837-EF11-86D4-6045BDEE16E6')   -- MJ: Entity Action Params
   AND "Name" = 'EntityActionID'
   AND "IncludeRelatedEntityNameFieldInBaseView" = TRUE;

DELETE FROM __mj."EntityField"
 WHERE "EntityID" IN ('3E248F34-2837-EF11-86D4-6045BDEE16E6',
                      '39248F34-2837-EF11-86D4-6045BDEE16E6',
                      '35248F34-2837-EF11-86D4-6045BDEE16E6',
                      '56248F34-2837-EF11-86D4-6045BDEE16E6')
   AND "Name" = 'EntityAction'
   AND "IsVirtual" = TRUE;

-- ── 3. spDeleteEntityWithCoreDependencies (#3546) ──────────────────────────────────────────
-- Every foreign key into Entity has an explicit decision from the checked-in policy: nullable
-- reference → set to NULL (with its paired record-ID column where a CHECK binds the two); NOT NULL →
-- delete the referencing rows; block → refused by the precondition. Rows that reference a row this
-- function deletes are cleared first, children before parents. A reference the policy does not know
-- about is reported by the precondition and nothing is deleted.
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityWithCoreDependencies"(p_EntityID uuid)
RETURNS SETOF record
LANGUAGE plpgsql
AS $spdel$
DECLARE
    -- The policy's delete and null references (packages/CodeGenLib/src/__tests__/fixtures/entity-delete-fk-policy.json).
    v_handled  text[] := ARRAY[
        'AccessControlRule.EntityID',
        'ActionExecutionLog.TargetEntityID',
        'AIAgentExample.PrimaryScopeEntityID',
        'AIAgentNote.PrimaryScopeEntityID',
        'AIAgentRun.PrimaryScopeEntityID',
        'AIAgentSession.LinkedEntityID',
        'ApplicationEntity.EntityID',
        'ArchiveConfigurationEntity.EntityID',
        'ArchiveRunDetail.EntityID',
        'AuditLog.EntityID',
        'CalendarEventLink.EntityID',
        'ClusterAnalysis.EntityID',
        'CompanyIntegrationEntityMap.EntityID',
        'CompanyIntegrationRecordMap.EntityID',
        'CompanyIntegrationRunDetail.EntityID',
        'ContentSource.EntityID',
        'Conversation.LinkedEntityID',
        'DataContextItem.EntityID',
        'DatasetItem.EntityID',
        'DuplicateRun.EntityID',
        'EntityAction.EntityID',
        'EntityAction.ScopeEntityID',
        'EntityAIAction.EntityID',
        'EntityAIAction.OutputEntityID',
        'EntityAlternateBaseView.EntityID',
        'EntityCommunicationMessageType.EntityID',
        'EntityDocument.EntityID',
        'EntityField.EntityID',
        'EntityField.RelatedEntityID',
        'EntityFormContribution.EntityID',
        'EntityFormContribution.RelatedEntityID',
        'EntityFormOverride.EntityID',
        'EntityOrganicKey.EntityID',
        'EntityOrganicKeyRelatedEntity.RelatedEntityID',
        'EntityPermission.EntityID',
        'EntityRecordDocument.EntityID',
        'EntityRelationship.EntityID',
        'EntityRelationship.RelatedEntityID',
        'EntitySetting.EntityID',
        'FeatureValue.EntityID',
        'FileEntityRecordLink.EntityID',
        'FormChromeRule.EntityID',
        'FormChromeRule.RelatedEntityID',
        'GeneratedCode.LinkedEntityID',
        'IdentityClaim.EntityID',
        'IntegrationURLFormat.EntityID',
        'InteractionLink.EntityID',
        'List.EntityID',
        'MaterializedResult.GeneratedEntityID',
        'MaterializedResult.SourceEntityID',
        'MLModelScoringBinding.TargetEntityID',
        'MLTrainingPipeline.TargetEntityID',
        'ProcessRunDetail.EntityID',
        'ProcessRun.EntityID',
        'QueryEntity.EntityID',
        'QueryField.SourceEntityID',
        'RecommendationItem.DestinationEntityID',
        'Recommendation.SourceEntityID',
        'RecordChange.EntityID',
        'RecordCloneLogItem.EntityID',
        'RecordCloneLog.RootEntityID',
        'RecordGeoCode.EntityID',
        'RecordLink.SourceEntityID',
        'RecordLink.TargetEntityID',
        'RecordMergeLog.EntityID',
        'RecordProcess.EntityID',
        'RecordProcessWatermark.EntityID',
        'ResourceType.CategoryEntityID',
        'ResourceType.EntityID',
        'RubricEvaluation.ContextEntityID',
        'RubricEvaluation.SubjectEntityID',
        'ScopedNotificationConfig.PrimaryScopeEntityID',
        'ScopedPromptConfig.PrimaryScopeEntityID',
        'ScopedPromptPart.PrimaryScopeEntityID',
        'SearchScopeEntity.EntityID',
        'SignatureRequest.EntityID',
        'SystemEvent.EntityID',
        'TaggedItem.EntityID',
        'TagScope.ScopeEntityID',
        'TemplateParam.EntityID',
        'TestRun.TargetLogEntityID',
        'UserApplicationEntity.EntityID',
        'UserFavorite.EntityID',
        'User.LinkedEntityID',
        'UserRecordLog.EntityID',
        'UserViewCategory.EntityID',
        'UserView.EntityID',
        'VersionLabel.EntityID',
        'VersionLabelItem.EntityID'
    ];
    v_ref      record;
    v_found    boolean;
    v_blockers text[] := ARRAY[]::text[];
    -- Rows this function deletes that other rows can reference, captured before any delete.
    v_EntityFieldIDs uuid[];
    v_UserViewIDs uuid[];
    v_UserViewCategoryIDs uuid[];
    v_UserViewRunIDs uuid[];
    v_ListIDs uuid[];
    v_EntityDocumentIDs uuid[];
    v_EntityRecordDocumentIDs uuid[];
    v_DuplicateRunIDs uuid[];
    v_DuplicateRunDetailIDs uuid[];
    v_EntityActionIDs uuid[];
    v_AlternateBaseViewIDs uuid[];
    v_MessageTypeIDs uuid[];
    v_OrganicKeyIDs uuid[];
    v_IntegrationEntityMapIDs uuid[];
    v_IntegrationRunDetailIDs uuid[];
    v_PipelineIDs uuid[];
    v_MLModelIDs uuid[];
    v_ProcessRunDetailIDs uuid[];
    v_RecommendationIDs uuid[];
    v_RecordCloneLogIDs uuid[];
    v_RecordMergeLogIDs uuid[];
    v_RecordProcessIDs uuid[];
    v_RubricEvaluationIDs uuid[];
    v_ResourceTypeIDs uuid[];
    v_AgentNoteIDs uuid[];
BEGIN
    -- ── Precondition: refuse to start if something not covered by the policy points at this entity ──
    -- Only NO ACTION / RESTRICT foreign keys can block the final DELETE (confdeltype 'a' / 'r');
    -- CASCADE, SET NULL and SET DEFAULT are cleared by PostgreSQL itself.
    FOR v_ref IN
        SELECT DISTINCT n.nspname AS sch, t.relname AS tbl, a.attname AS col
        FROM pg_constraint c
        JOIN pg_class t     ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f'
          AND c.confrelid = '__mj."Entity"'::regclass
          AND c.confdeltype IN ('a', 'r')
          AND NOT (n.nspname = '__mj' AND (t.relname || '.' || a.attname) = ANY (v_handled))
        ORDER BY 1, 2, 3
    LOOP
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)', v_ref.sch, v_ref.tbl, v_ref.col)
            INTO v_found USING p_EntityID;
        IF v_found THEN
            v_blockers := v_blockers || (v_ref.sch || '.' || v_ref.tbl || '.' || v_ref.col);
        END IF;
    END LOOP;

    IF cardinality(v_blockers) > 0 THEN
        RAISE EXCEPTION 'Cannot delete entity %: rows still reference it through foreign keys this procedure does not clear (%). Clear them first. Nothing has been deleted.',
            p_EntityID, left(array_to_string(v_blockers, ', '), 1600);
    END IF;

    -- ── Rows this function deletes that other rows can reference: capture their IDs up front ──
    v_EntityFieldIDs := ARRAY(SELECT "ID" FROM __mj."EntityField" WHERE "EntityID" = p_EntityID);

    v_UserViewIDs := ARRAY(SELECT "ID" FROM __mj."UserView" WHERE "EntityID" = p_EntityID);

    v_UserViewCategoryIDs := ARRAY(SELECT "ID" FROM __mj."UserViewCategory" WHERE "EntityID" = p_EntityID);

    v_UserViewRunIDs := ARRAY(SELECT "ID" FROM __mj."UserViewRun" WHERE "UserViewID" = ANY (v_UserViewIDs));

    v_ListIDs := ARRAY(SELECT "ID" FROM __mj."List" WHERE "EntityID" = p_EntityID);

    v_EntityDocumentIDs := ARRAY(SELECT "ID" FROM __mj."EntityDocument" WHERE "EntityID" = p_EntityID);

    v_EntityRecordDocumentIDs := ARRAY(SELECT "ID" FROM __mj."EntityRecordDocument"
        WHERE "EntityID" = p_EntityID OR "EntityDocumentID" = ANY (v_EntityDocumentIDs));

    v_DuplicateRunIDs := ARRAY(SELECT "ID" FROM __mj."DuplicateRun"
        WHERE "EntityID" = p_EntityID OR "EntityDocumentID" = ANY (v_EntityDocumentIDs));

    v_DuplicateRunDetailIDs := ARRAY(SELECT "ID" FROM __mj."DuplicateRunDetail"
        WHERE "DuplicateRunID" = ANY (v_DuplicateRunIDs));

    v_EntityActionIDs := ARRAY(SELECT "ID" FROM __mj."EntityAction"
        WHERE "EntityID" = p_EntityID OR "ScopeEntityID" = p_EntityID);

    v_AlternateBaseViewIDs := ARRAY(SELECT "ID" FROM __mj."EntityAlternateBaseView" WHERE "EntityID" = p_EntityID);

    v_MessageTypeIDs := ARRAY(SELECT "ID" FROM __mj."EntityCommunicationMessageType" WHERE "EntityID" = p_EntityID);

    v_OrganicKeyIDs := ARRAY(SELECT "ID" FROM __mj."EntityOrganicKey" WHERE "EntityID" = p_EntityID);

    v_IntegrationEntityMapIDs := ARRAY(SELECT "ID" FROM __mj."CompanyIntegrationEntityMap" WHERE "EntityID" = p_EntityID);

    v_IntegrationRunDetailIDs := ARRAY(SELECT "ID" FROM __mj."CompanyIntegrationRunDetail" WHERE "EntityID" = p_EntityID);

    v_PipelineIDs := ARRAY(SELECT "ID" FROM __mj."MLTrainingPipeline" WHERE "TargetEntityID" = p_EntityID);

    v_MLModelIDs := ARRAY(SELECT "ID" FROM __mj."MLModel" WHERE "PipelineID" = ANY (v_PipelineIDs));

    v_ProcessRunDetailIDs := ARRAY(SELECT "ID" FROM __mj."ProcessRunDetail" WHERE "EntityID" = p_EntityID);

    v_RecommendationIDs := ARRAY(SELECT "ID" FROM __mj."Recommendation" WHERE "SourceEntityID" = p_EntityID);

    v_RecordCloneLogIDs := ARRAY(SELECT "ID" FROM __mj."RecordCloneLog" WHERE "RootEntityID" = p_EntityID);

    v_RecordMergeLogIDs := ARRAY(SELECT "ID" FROM __mj."RecordMergeLog" WHERE "EntityID" = p_EntityID);

    v_RecordProcessIDs := ARRAY(SELECT "ID" FROM __mj."RecordProcess" WHERE "EntityID" = p_EntityID);

    v_RubricEvaluationIDs := ARRAY(SELECT "ID" FROM __mj."RubricEvaluation" WHERE "SubjectEntityID" = p_EntityID);

    v_ResourceTypeIDs := ARRAY(SELECT "ID" FROM __mj."ResourceType" WHERE "EntityID" = p_EntityID);

    v_AgentNoteIDs := ARRAY(SELECT "ID" FROM __mj."AIAgentNote" WHERE "PrimaryScopeEntityID" = p_EntityID);

    -- RecordChange can be large, so its doomed set stays a subquery instead of a table variable.

    -- ── Nullable references to this entity: cleared, the rows survive ──
    UPDATE __mj."ActionExecutionLog" SET "TargetEntityID" = NULL WHERE "TargetEntityID" = p_EntityID;
    UPDATE __mj."AIAgentRun" SET "PrimaryScopeEntityID" = NULL WHERE "PrimaryScopeEntityID" = p_EntityID;
    -- CK_AIAgentSession_LinkBinding / CK_Conversation_LinkBinding: both columns or neither
    UPDATE __mj."AIAgentSession" SET "LinkedEntityID" = NULL, "LinkedRecordID" = NULL WHERE "LinkedEntityID" = p_EntityID;
    UPDATE __mj."AuditLog" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."ClusterAnalysis" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."ContentSource" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."Conversation" SET "LinkedEntityID" = NULL, "LinkedRecordID" = NULL WHERE "LinkedEntityID" = p_EntityID;
    UPDATE __mj."DataContextItem" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    -- Other entities' fields that point AT this entity (#3561)
    UPDATE __mj."EntityField" SET "RelatedEntityID" = NULL WHERE "RelatedEntityID" = p_EntityID;
    UPDATE __mj."GeneratedCode" SET "LinkedEntityID" = NULL WHERE "LinkedEntityID" = p_EntityID;
    UPDATE __mj."IdentityClaim" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."MaterializedResult" SET "GeneratedEntityID" = NULL WHERE "GeneratedEntityID" = p_EntityID;
    UPDATE __mj."MaterializedResult" SET "SourceEntityID" = NULL WHERE "SourceEntityID" = p_EntityID;
    UPDATE __mj."MLModelScoringBinding" SET "TargetEntityID" = NULL WHERE "TargetEntityID" = p_EntityID;
    UPDATE __mj."ProcessRun" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."QueryField" SET "SourceEntityID" = NULL WHERE "SourceEntityID" = p_EntityID;
    -- ResourceType references Entity twice; EntityID is a delete (below), CategoryEntityID is cleared (#4483)
    UPDATE __mj."ResourceType" SET "CategoryEntityID" = NULL WHERE "CategoryEntityID" = p_EntityID;
    -- CK_RubricEvaluation_ContextPair: both columns or neither
    UPDATE __mj."RubricEvaluation" SET "ContextEntityID" = NULL, "ContextRecordID" = NULL WHERE "ContextEntityID" = p_EntityID;
    UPDATE __mj."SignatureRequest" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    -- SystemEvent has a physical FK but no entity, so generated metadata does not list it
    UPDATE __mj."SystemEvent" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."TemplateParam" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."TestRun" SET "TargetLogEntityID" = NULL WHERE "TargetLogEntityID" = p_EntityID;
    UPDATE __mj."User" SET "LinkedEntityID" = NULL WHERE "LinkedEntityID" = p_EntityID;
    UPDATE __mj."VersionLabel" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;

    -- ── Nullable references to rows deleted below: cleared first ──
    UPDATE __mj."AIAgentNote" SET "ConsolidatedIntoNoteID" = NULL WHERE "ConsolidatedIntoNoteID" = ANY (v_AgentNoteIDs);
    UPDATE __mj."ErrorLog" SET "CompanyIntegrationRunDetailID" = NULL WHERE "CompanyIntegrationRunDetailID" = ANY (v_IntegrationRunDetailIDs);
    UPDATE __mj."ActionExecutionLog" SET "EntityActionID" = NULL WHERE "EntityActionID" = ANY (v_EntityActionIDs);
    UPDATE __mj."EntityAlternateBaseView" SET "ParentID" = NULL WHERE "ParentID" = ANY (v_AlternateBaseViewIDs);
    UPDATE __mj."QueryEntity" SET "AlternateBaseViewID" = NULL WHERE "AlternateBaseViewID" = ANY (v_AlternateBaseViewIDs);
    UPDATE __mj."ContentSource" SET "EntityDocumentID" = NULL WHERE "EntityDocumentID" = ANY (v_EntityDocumentIDs);
    UPDATE __mj."ContentItem" SET "EntityRecordDocumentID" = NULL WHERE "EntityRecordDocumentID" = ANY (v_EntityRecordDocumentIDs);
    UPDATE __mj."DuplicateRun" SET "SourceListID" = NULL WHERE "SourceListID" = ANY (v_ListIDs);
    UPDATE __mj."RecordProcess" SET "ScopeListID" = NULL WHERE "ScopeListID" = ANY (v_ListIDs);
    UPDATE __mj."MLTrainingRun" SET "ResultingModelID" = NULL WHERE "ResultingModelID" = ANY (v_MLModelIDs);
    UPDATE __mj."FeatureValue" SET "ProcessRunDetailID" = NULL WHERE "ProcessRunDetailID" = ANY (v_ProcessRunDetailIDs);
    UPDATE __mj."RecordChange" SET "RestoredFromID" = NULL
        WHERE "RestoredFromID" IN (SELECT "ID" FROM __mj."RecordChange" WHERE "EntityID" = p_EntityID);
    UPDATE __mj."DuplicateRunDetailMatch" SET "RecordMergeLogID" = NULL WHERE "RecordMergeLogID" = ANY (v_RecordMergeLogIDs);
    UPDATE __mj."FeatureValueCache" SET "RecordProcessID" = NULL WHERE "RecordProcessID" = ANY (v_RecordProcessIDs);
    UPDATE __mj."MLModelScoringBinding" SET "RecordProcessID" = NULL WHERE "RecordProcessID" = ANY (v_RecordProcessIDs);
    UPDATE __mj."ProcessRun" SET "RecordProcessID" = NULL WHERE "RecordProcessID" = ANY (v_RecordProcessIDs);
    UPDATE __mj."MagicLinkInvite" SET "ResourceTypeID" = NULL WHERE "ResourceTypeID" = ANY (v_ResourceTypeIDs);
    UPDATE __mj."UserNotification" SET "ResourceTypeID" = NULL WHERE "ResourceTypeID" = ANY (v_ResourceTypeIDs);
    UPDATE __mj."RubricEvaluation" SET "SupersedesEvaluationID" = NULL WHERE "SupersedesEvaluationID" = ANY (v_RubricEvaluationIDs);
    UPDATE __mj."UserView" SET "CategoryID" = NULL WHERE "CategoryID" = ANY (v_UserViewCategoryIDs);
    UPDATE __mj."UserViewCategory" SET "ParentID" = NULL WHERE "ParentID" = ANY (v_UserViewCategoryIDs);
    UPDATE __mj."DataContextItem" SET "ViewID" = NULL WHERE "ViewID" = ANY (v_UserViewIDs);
    UPDATE __mj."EntityRelationship" SET "DisplayUserViewID" = NULL WHERE "DisplayUserViewID" = ANY (v_UserViewIDs);
    UPDATE __mj."List" SET "SourceViewID" = NULL WHERE "SourceViewID" = ANY (v_UserViewIDs);
    UPDATE __mj."RecordProcess" SET "ScopeViewID" = NULL WHERE "ScopeViewID" = ANY (v_UserViewIDs);

    -- ── Deletes, children before parents ──

    -- Entity fields: values and permissions first; the EntityField rows go last, just before Entity
    DELETE FROM __mj."EntityFieldValue" WHERE "EntityFieldID" = ANY (v_EntityFieldIDs);
    DELETE FROM __mj."EntityFieldPermission" WHERE "EntityFieldID" = ANY (v_EntityFieldIDs);

    -- Saved-view run history
    DELETE FROM __mj."UserViewRunDetail" WHERE "UserViewRunID" = ANY (v_UserViewRunIDs);
    DELETE FROM __mj."UserViewRun" WHERE "UserViewID" = ANY (v_UserViewIDs);

    -- Lists
    DELETE FROM __mj."ListDetail" WHERE "ListID" = ANY (v_ListIDs);
    DELETE FROM __mj."ListInvitation" WHERE "ListID" = ANY (v_ListIDs);
    DELETE FROM __mj."ListShare" WHERE "ListID" = ANY (v_ListIDs);
    DELETE FROM __mj."List" WHERE "EntityID" = p_EntityID;

    -- Duplicate detection (a run is tied to the entity directly or through its entity document)
    DELETE FROM __mj."DuplicateRunDetailMatch" WHERE "DuplicateRunDetailID" = ANY (v_DuplicateRunDetailIDs);
    DELETE FROM __mj."DuplicateRunDetail" WHERE "DuplicateRunID" = ANY (v_DuplicateRunIDs);
    DELETE FROM __mj."DuplicateRun" WHERE "EntityID" = p_EntityID OR "EntityDocumentID" = ANY (v_EntityDocumentIDs);

    -- Entity documents
    DELETE FROM __mj."EntityDocumentRun" WHERE "EntityDocumentID" = ANY (v_EntityDocumentIDs);
    DELETE FROM __mj."EntityDocumentSetting" WHERE "EntityDocumentID" = ANY (v_EntityDocumentIDs);
    DELETE FROM __mj."EntityRecordDocument" WHERE "EntityID" = p_EntityID OR "EntityDocumentID" = ANY (v_EntityDocumentIDs);
    DELETE FROM __mj."EntityDocument" WHERE "EntityID" = p_EntityID;

    -- Entity actions (on this entity, or scoped to one of its records)
    DELETE FROM __mj."EntityActionFilter" WHERE "EntityActionID" = ANY (v_EntityActionIDs);
    DELETE FROM __mj."EntityActionInvocation" WHERE "EntityActionID" = ANY (v_EntityActionIDs);
    DELETE FROM __mj."EntityActionParam" WHERE "EntityActionID" = ANY (v_EntityActionIDs);
    DELETE FROM __mj."EntityAction" WHERE "EntityID" = p_EntityID OR "ScopeEntityID" = p_EntityID;

    -- Communication message types
    DELETE FROM __mj."EntityCommunicationField" WHERE "EntityCommunicationMessageTypeID" = ANY (v_MessageTypeIDs);
    DELETE FROM __mj."EntityCommunicationMessageType" WHERE "EntityID" = p_EntityID;

    -- Organic keys
    DELETE FROM __mj."EntityOrganicKeyRelatedEntity" WHERE "RelatedEntityID" = p_EntityID OR "EntityOrganicKeyID" = ANY (v_OrganicKeyIDs);
    DELETE FROM __mj."EntityOrganicKey" WHERE "EntityID" = p_EntityID;

    -- Company integrations
    DELETE FROM __mj."CompanyIntegrationFieldMap" WHERE "EntityMapID" = ANY (v_IntegrationEntityMapIDs);
    DELETE FROM __mj."CompanyIntegrationSyncWatermark" WHERE "EntityMapID" = ANY (v_IntegrationEntityMapIDs);
    DELETE FROM __mj."CompanyIntegrationEntityMap" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."CompanyIntegrationRecordMap" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."CompanyIntegrationRunDetail" WHERE "EntityID" = p_EntityID;

    -- ML pipelines targeting this entity, their models, runs and scoring bindings
    DELETE FROM __mj."MLModelScoringBinding" WHERE "MLModelID" = ANY (v_MLModelIDs);
    DELETE FROM __mj."MLTrainingRun" WHERE "PipelineID" = ANY (v_PipelineIDs);
    DELETE FROM __mj."MLModel" WHERE "PipelineID" = ANY (v_PipelineIDs);
    DELETE FROM __mj."MLTrainingPipeline" WHERE "TargetEntityID" = p_EntityID;

    -- Record processes and feature values
    DELETE FROM __mj."FeatureValue" WHERE "EntityID" = p_EntityID OR "RecordProcessID" = ANY (v_RecordProcessIDs);
    DELETE FROM __mj."FeaturePipelineVersion" WHERE "RecordProcessID" = ANY (v_RecordProcessIDs);
    DELETE FROM __mj."RecordProcessWatermark" WHERE "EntityID" = p_EntityID OR "RecordProcessID" = ANY (v_RecordProcessIDs);
    DELETE FROM __mj."RecordProcess" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."ProcessRunDetail" WHERE "EntityID" = p_EntityID;

    -- Recommendations
    DELETE FROM __mj."RecommendationItem" WHERE "DestinationEntityID" = p_EntityID OR "RecommendationID" = ANY (v_RecommendationIDs);
    DELETE FROM __mj."Recommendation" WHERE "SourceEntityID" = p_EntityID;

    -- Record history: version labels, changes, clone and merge logs
    DELETE FROM __mj."VersionLabelItem" WHERE "EntityID" = p_EntityID
        OR "RecordChangeID" IN (SELECT "ID" FROM __mj."RecordChange" WHERE "EntityID" = p_EntityID);
    DELETE FROM __mj."RecordChange" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."RecordCloneLogItem" WHERE "EntityID" = p_EntityID OR "RecordCloneLogID" = ANY (v_RecordCloneLogIDs);
    DELETE FROM __mj."RecordCloneLog" WHERE "RootEntityID" = p_EntityID;
    DELETE FROM __mj."RecordMergeDeletionLog" WHERE "RecordMergeLogID" = ANY (v_RecordMergeLogIDs);
    DELETE FROM __mj."RecordMergeLog" WHERE "EntityID" = p_EntityID;

    -- Rubric evaluations of this entity's records
    DELETE FROM __mj."RubricEvaluationScore" WHERE "EvaluationID" = ANY (v_RubricEvaluationIDs);
    DELETE FROM __mj."RubricEvaluation" WHERE "SubjectEntityID" = p_EntityID;

    -- Resource types for this entity, with their links, permissions and workspace items
    DELETE FROM __mj."ResourceLink" WHERE "ResourceTypeID" = ANY (v_ResourceTypeIDs);
    DELETE FROM __mj."ResourcePermission" WHERE "ResourceTypeID" = ANY (v_ResourceTypeIDs);
    DELETE FROM __mj."WorkspaceItem" WHERE "ResourceTypeID" = ANY (v_ResourceTypeIDs);
    DELETE FROM __mj."ResourceType" WHERE "EntityID" = p_EntityID;

    -- Scope columns whose NULL means "global": delete rather than widen the scope
    DELETE FROM __mj."AIAgentNote" WHERE "PrimaryScopeEntityID" = p_EntityID;
    DELETE FROM __mj."AIAgentExample" WHERE "PrimaryScopeEntityID" = p_EntityID;
    DELETE FROM __mj."ScopedNotificationConfig" WHERE "PrimaryScopeEntityID" = p_EntityID;
    DELETE FROM __mj."ScopedPromptConfig" WHERE "PrimaryScopeEntityID" = p_EntityID;
    DELETE FROM __mj."ScopedPromptPart" WHERE "PrimaryScopeEntityID" = p_EntityID;

    -- Datasets: bump the parent so cached datasets refresh, then drop the item
    UPDATE __mj."Dataset" SET "__mj_UpdatedAt" = NOW()
        WHERE "ID" IN (SELECT "DatasetID" FROM __mj."DatasetItem" WHERE "EntityID" = p_EntityID);
    DELETE FROM __mj."DatasetItem" WHERE "EntityID" = p_EntityID;

    -- Saved views, then their categories (UserView.CategoryID was cleared above)
    DELETE FROM __mj."UserView" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."UserViewCategory" WHERE "EntityID" = p_EntityID;

    -- Rows with no dependents of their own
    DELETE FROM __mj."AccessControlRule" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."ApplicationEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."ArchiveConfigurationEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."ArchiveRunDetail" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."CalendarEventLink" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityAIAction" WHERE "EntityID" = p_EntityID OR "OutputEntityID" = p_EntityID;
    DELETE FROM __mj."EntityAlternateBaseView" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityFormContribution" WHERE "EntityID" = p_EntityID OR "RelatedEntityID" = p_EntityID;
    DELETE FROM __mj."EntityFormOverride" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityPermission" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityRelationship" WHERE "EntityID" = p_EntityID OR "RelatedEntityID" = p_EntityID;
    DELETE FROM __mj."EntitySetting" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."FileEntityRecordLink" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."FormChromeRule" WHERE "EntityID" = p_EntityID OR "RelatedEntityID" = p_EntityID;
    DELETE FROM __mj."IntegrationURLFormat" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."InteractionLink" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."QueryEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."RecordGeoCode" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."RecordLink" WHERE "SourceEntityID" = p_EntityID OR "TargetEntityID" = p_EntityID;
    DELETE FROM __mj."SearchScopeEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."TaggedItem" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."TagScope" WHERE "ScopeEntityID" = p_EntityID;
    DELETE FROM __mj."UserApplicationEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."UserFavorite" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."UserRecordLog" WHERE "EntityID" = p_EntityID;

    -- The entity's own fields, then the entity
    DELETE FROM __mj."EntityField" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."Entity" WHERE "ID" = p_EntityID;

END
$spdel$;

GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityWithCoreDependencies"(uuid) TO "cdp_Developer", "cdp_Integration";
