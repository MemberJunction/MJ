-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ════════════════════════════════════════════════════════════════════════════════════════ */
/* Unique keys as column sets; EntityField.IsUnique narrowed to single-column keys (#4536) */
/*  1. EntityUniqueKey: one row per unique index or unique constraint (primary keys excluded) on */
/*     an entity's base table, with its key columns in key order. CodeGen fills and prunes it */
/*     from the catalog on every run. Composite uniqueness lives here, not on EntityField. */
/*  2. vwTableUniqueKeys: one row per KEY column of every enabled unique index/constraint. */
/*     INCLUDE columns are no longer listed. New columns say which index the row belongs to, the */
/*     column's position in the key, how many key columns the index has, and its filter. */
/*  3. spUpdateExistingEntityFieldsFromSchema: IsUnique = 1 only when the column alone is the key */
/*     of an unfiltered unique index/constraint, or alone is the primary key. Every column of a */
/*     composite unique index or composite primary key was marked unique before. The next run */
/*     clears IsUnique on those columns; soft-PK rows keep their frozen flags as before. */
/*  4. spDeleteEntityWithCoreDependencies: deletes the entity's EntityUniqueKey rows */
/*     (entity-delete-fk-policy.json carries the matching entry). */
/* The PostgreSQL counterpart is produced at release; SQLConverter's CatalogViewRule carries the */
/* PostgreSQL text of vwTableUniqueKeys. */
/* ════════════════════════════════════════════════════════════════════════════════════════ */
/* ── 1. EntityUniqueKey ────────────────────────────────────────────────────────────────────── */
CREATE TABLE __mj."EntityUniqueKey" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "EntityID" UUID NOT NULL,
  "Name" VARCHAR(255) NOT NULL,
  "FieldNames" TEXT NOT NULL,
  "FilterDefinition" TEXT NULL,
  CONSTRAINT "PK_EntityUniqueKey" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_EntityUniqueKey_Entity" FOREIGN KEY ("EntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "UQ_EntityUniqueKey_EntityID_Name" UNIQUE (
    "EntityID",
    "Name"
  )
);

COMMENT ON TABLE __mj."EntityUniqueKey" IS 'Unique keys of an entity''s base table as column sets: one row per unique index or unique constraint, primary keys excluded. Maintained by CodeGen from the database catalog on every run; edits are overwritten. EntityField.IsUnique is set only when a column alone is such a key, so a composite key appears here and not on its columns.';

COMMENT ON COLUMN __mj."EntityUniqueKey"."EntityID" IS 'Entity whose base table has this unique key.';

COMMENT ON COLUMN __mj."EntityUniqueKey"."Name" IS 'Name of the unique index or unique constraint in the database.';

COMMENT ON COLUMN __mj."EntityUniqueKey"."FieldNames" IS 'Comma-separated names of the key columns, in key order. INCLUDE columns are not part of the key and are not listed.';

COMMENT ON COLUMN __mj."EntityUniqueKey"."FilterDefinition" IS 'Predicate of a filtered (SQL Server) or partial (PostgreSQL) unique index, as the database reports it. NULL when the key applies to every row. A filtered key only guarantees uniqueness among the rows that match it.';

-- ╔══ HAND-FINISHED FOR POSTGRESQL: sections 2–4 of the SQL Server migration ══╗
-- The CodeGen section below was baked natively from a copy of the SQL Server source with sections
-- 2, 3 and 4 removed; those three are handled here:
--
--  2. vwTableUniqueKeys — the SQL Server body reads sys.indexes / sys.tables and failed to apply
--     ("relation sys.tables does not exist"). The split converter does not run CatalogViewRule, so
--     this is CatalogViewRule's PostgreSQL text for the view, verbatim (the migration header names
--     CatalogViewRule as the carrier). It appends KeyOrdinal / KeyColumnCount / IsFiltered /
--     FilterDefinition / IndexName after the existing SchemaName / TableName / ColumnName, so
--     CREATE OR REPLACE is valid, and it lists key columns only (cols.ord <= indnkeyatts).
--
--  3. spUpdateExistingEntityFieldsFromSchema — PG-BY-ANOTHER-ROUTE, not ported. On PostgreSQL this
--     routine is CodeGen output (packages/CodeGenLib/src/Database/providers/postgresql/
--     metadataSupportObjects.ts), not migration content, and the same change (#4536: IsUnique only
--     for a single-column key; KeyColumnCount on primary keys) is already in that generator. Same
--     precedent as V202608260829 Heal_SPs_IncludedSchemaNames (DEPLOYMENT.md Step 8, trap 8).
--     Transpiling the T-SQL body would overwrite the generated PL/pgSQL routine.
--
--  4. spDeleteEntityWithCoreDependencies — the V202611080314 PostgreSQL port in this release plus
--     this migration's change: 'EntityUniqueKey.EntityID' joins the handled-reference list, and the
--     entity's EntityUniqueKey rows are deleted (after EntitySetting, as on SQL Server).
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── 2. vwTableUniqueKeys (CatalogViewRule PostgreSQL text) ──
CREATE OR REPLACE VIEW __mj."vwTableUniqueKeys" AS
SELECT
    n.nspname                                  AS "SchemaName",
    c.relname                                  AS "TableName",
    a.attname                                  AS "ColumnName",
    ix.relname                                 AS "IndexName",
    cols.ord::integer                          AS "KeyOrdinal",
    i.indnkeyatts::integer                     AS "KeyColumnCount",
    (i.indpred IS NOT NULL)                    AS "IsFiltered",
    pg_catalog.pg_get_expr(i.indpred, i.indrelid) AS "FilterDefinition"
FROM
    pg_catalog.pg_index i
INNER JOIN pg_catalog.pg_class c       ON i.indrelid = c.oid
INNER JOIN pg_catalog.pg_class ix      ON i.indexrelid = ix.oid
INNER JOIN pg_catalog.pg_namespace n   ON c.relnamespace = n.oid
CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS cols(col_num, ord)
INNER JOIN pg_catalog.pg_attribute a
    ON a.attrelid = c.oid AND a.attnum = cols.col_num
WHERE
    i.indisunique = true
    AND i.indisprimary = false
    AND i.indisvalid = true
    AND cols.ord <= i.indnkeyatts
    -- [Large Schema Series] same namespace exclusion as vwTablePrimaryKeys.
    -- Mirrors migration V202607181800 so a regenerated PG baseline keeps this filter.
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND n.nspname NOT LIKE 'pg_temp%';

-- ── 4. spDeleteEntityWithCoreDependencies ──
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
        'EntityUniqueKey.EntityID',
        'FeatureValue.EntityID',
        'FileEntityRecordLink.EntityID',
        'FormChromeRule.EntityID',
        'FormChromeRule.RelatedEntityID',
        'GraphEdge.SourceEntityID',
        'GraphEdge.TargetEntityID',
        'GraphEdgeTypeEndpoint.EntityID',
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
    -- CK_Conversation_LinkBinding / CK_Conversation_AnchorLinkBinding: clear LinkedRecordID and anchor columns with LinkedEntityID
    UPDATE __mj."Conversation" SET "LinkedEntityID" = NULL, "LinkedRecordID" = NULL, "AnchorType" = NULL, "AnchorKey" = NULL, "AnchorMetadata" = NULL WHERE "LinkedEntityID" = p_EntityID;
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
    UPDATE __mj."QueryField" SET "SourceEntityFieldID" = NULL WHERE "SourceEntityFieldID" = ANY (v_EntityFieldIDs);

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
    -- the pipelines' training snapshots; a run of another pipeline that names one loses only the link
    UPDATE __mj."MLTrainingRun" SET "TrainingSnapshotID" = NULL WHERE "TrainingSnapshotID" IN (SELECT "ID" FROM __mj."MLTrainingSnapshot" WHERE "PipelineID" = ANY (v_PipelineIDs));
    DELETE FROM __mj."MLTrainingSnapshot" WHERE "PipelineID" = ANY (v_PipelineIDs);
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
    DELETE FROM __mj."EntityUniqueKey" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."FileEntityRecordLink" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."FormChromeRule" WHERE "EntityID" = p_EntityID OR "RelatedEntityID" = p_EntityID;
    DELETE FROM __mj."IntegrationURLFormat" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."InteractionLink" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."QueryEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."RecordGeoCode" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."RecordLink" WHERE "SourceEntityID" = p_EntityID OR "TargetEntityID" = p_EntityID;
    DELETE FROM __mj."GraphEdge" WHERE "SourceEntityID" = p_EntityID OR "TargetEntityID" = p_EntityID;
    DELETE FROM __mj."GraphEdgeTypeEndpoint" WHERE "EntityID" = p_EntityID;
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


/* ============================================================================= */
/* ============================================================================= */
/* ============================================================================= */
/*                    CODEGEN OUTPUT BELOW THIS LINE */
/* Everything below this block was generated by the MemberJunction CodeGen tool */
/* after the hand-written DDL above was applied to a clean database built from */
/* the committed migrations and metadata. It contains the new MJ: Entity Unique */
/* Keys entity: its Entity and EntityField metadata, the vwEntityUniqueKeys base */
/* view, the spCreate / spUpdate / spDelete procedures and their permission */
/* grants, and the unique-key rows CodeGen read from the core schema's catalog. */
/* DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen */
/* and replace this entire section with the fresh output. */
/* ============================================================================= */
/* ============================================================================= */
/* ============================================================================= */
/* SQL generated to create new entity MJ: Entity Unique Keys */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd7b47afc-c1f3-48d0-9c92-839f52fa5a4f',
    'MJ: Entity Unique Keys',
    'Entity Unique Keys',
    'Unique keys of an entity''s base table as column sets: one row per unique index or unique constraint, primary keys excluded. Maintained by CodeGen from the database catalog on every run; edits are overwritten. EntityField.IsUnique is set only when a column alone is such a key, so a composite key appears here and not on its columns.',
    NULL,
    'EntityUniqueKey',
    'vwEntityUniqueKeys',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Entity Unique Keys to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'd7b47afc-c1f3-48d0-9c92-839f52fa5a4f',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Entity Unique Keys for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Entity Unique Keys for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Entity Unique Keys for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."EntityUniqueKey"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityUniqueKey */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityUniqueKey */
UPDATE __mj."EntityUniqueKey" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'EntityUniqueKey' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."EntityUniqueKey" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."EntityUniqueKey" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."EntityUniqueKey"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityUniqueKey */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityUniqueKey */
UPDATE __mj."EntityUniqueKey" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'EntityUniqueKey' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."EntityUniqueKey" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."EntityUniqueKey" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a4791a89-4b20-4392-a07a-eb8dd50a2806' OR ("EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a4791a89-4b20-4392-a07a-eb8dd50a2806', 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' /* Entity: MJ: Entity Unique Keys */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f626efc0-570f-40b3-b12d-9b869a02298b' OR ("EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f626efc0-570f-40b3-b12d-9b869a02298b', 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' /* Entity: MJ: Entity Unique Keys */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'), 'EntityID', 'Entity ID', 'Entity whose base table has this unique key.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'add49c45-cf08-442a-bb29-13747cd58e93' OR ("EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('add49c45-cf08-442a-bb29-13747cd58e93', 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' /* Entity: MJ: Entity Unique Keys */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'), 'Name', 'Name', 'Name of the unique index or unique constraint in the database.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1060bd88-a92f-4b8a-81d3-b1a61dee5baf' OR ("EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND "Name" = 'FieldNames')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1060bd88-a92f-4b8a-81d3-b1a61dee5baf', 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' /* Entity: MJ: Entity Unique Keys */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'), 'FieldNames', 'Field Names', 'Comma-separated names of the key columns, in key order. INCLUDE columns are not part of the key and are not listed.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c1149a3a-deca-42f6-a2ac-acac8ef0633d' OR ("EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND "Name" = 'FilterDefinition')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c1149a3a-deca-42f6-a2ac-acac8ef0633d', 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' /* Entity: MJ: Entity Unique Keys */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'), 'FilterDefinition', 'Filter Definition', 'Predicate of a filtered (SQL Server) or partial (PostgreSQL) unique index, as the database reports it. NULL when the key applies to every row. A filtered key only guarantees uniqueness among the rows that match it.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5131ebe3-d1cb-420a-83cb-55d200b2685b' OR ("EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5131ebe3-d1cb-420a-83cb-55d200b2685b', 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' /* Entity: MJ: Entity Unique Keys */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9fba60a4-21fc-40b7-8b5f-246b95ccf4e9' OR ("EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9fba60a4-21fc-40b7-8b5f-246b95ccf4e9', 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' /* Entity: MJ: Entity Unique Keys */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to sync entity unique keys (263 added, 0 updated, 0 removed) */
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '45137c63-177d-4f89-8493-69efbc55a2c1',
    '00766B45-E83F-EF11-86D4-0022481D1B23',
    'UQ_ExplorerNavigationItem_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '7883c891-960b-40a4-ae68-07d7a3ec00cf',
    '00766B45-E83F-EF11-86D4-0022481D1B23',
    'UQ_ExplorerNavigationItem_Route',
    'Route',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1b65ae6c-3f1d-4982-8a82-4a653f1b994c',
    '02B2ECDF-FC92-4D19-B332-F840EA708565',
    'UQ_AIConfigurationParam_Config_Name',
    'ConfigurationID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c110d8ad-7f20-4294-aecd-f6a70d988a0c',
    '0325A316-D1DC-4DC7-947B-358C96860725',
    'UQ_TestSuiteTest_Suite_Test',
    'SuiteID,TestID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '8cb15089-6949-46d7-9ebc-42170278d36d',
    '03716AC0-1509-471C-9159-C67D1BE6971E',
    'UQ_EntityOrganicKey_EntityName',
    'EntityID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'f142b5c5-ab5b-42fc-b4d7-b93f0a029ca7',
    '05136FE9-994B-4C0F-926E-DEE4D8D928C1',
    'UQ_MLAlgorithmUseCaseRanking_Algo_UseCase',
    'MLAlgorithmID,MLAlgorithmUseCaseID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c7e15213-6098-4a33-9a19-358f92b39ddb',
    '078E485B-0CC4-4E2A-ADB8-52FE8E571E88',
    'UQ_ExternalDataSource_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'd53922fb-b1b6-4ef1-983f-e194a6d77cd3',
    '08794D87-CFBF-480E-AA91-B2E76A4FC8A2',
    'UQ_ConversationCompactionRun_ConversationDetail',
    'ConversationDetailID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'd013e365-967c-49f1-9070-705e2db72225',
    '094CD426-12FF-4B26-A94B-9AC23C5829A0',
    'UQ_AIAgentPrompt_Agent_Prompt_Config',
    'AgentID,PromptID,ConfigurationID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '88438e04-daa9-4c48-847e-1d8971f1b28e',
    '0B248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_ResourceType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c61adaad-fc44-4b5e-9c52-ac85225cba36',
    '0DCA1987-4D89-4C8F-81B3-B47A8019AF97',
    'UQ_AIUsageType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'df35312c-1a86-4582-9a35-92e9db9afcf9',
    '10248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_Dataset_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '7c40230b-4801-45af-81c5-ebe8eb30270e',
    '12193852-F824-416B-9269-EC5D71122959',
    'UQ_AIAgentCredential',
    'AgentID,CredentialID,Purpose',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '93ee58e1-a67f-46ad-b852-229f2ff5553f',
    '122ED707-2BC0-42E8-B25F-6BDDE7164962',
    'UQ_RubricEvaluationScore_Criterion',
    'EvaluationID,CriterionID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '9e00b4c8-1736-48d1-880c-07cef33f3be9',
    '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B',
    'UQ_APIScope_FullPath',
    'FullPath',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '935d813d-2a1e-4d50-a8f6-397730aaee00',
    '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B',
    'UQ_APIScope_ParentName',
    'ParentID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '4bd6b204-71b2-4d48-a1c2-182d47d96726',
    '12C21789-12CC-4A8C-81ED-FFCBC1D69336',
    'UQ_StateProvince_CountryCode',
    'CountryID,Code',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'd05d26e1-3b13-4869-a887-7171ab950157',
    '12C21789-12CC-4A8C-81ED-FFCBC1D69336',
    'UQ_StateProvince_ISO3166_2',
    'ISO3166_2',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '9f1c9f5a-b9ba-48f3-bcab-cb3a35e909ee',
    '139AB3B7-C1AB-49BD-A473-47D45A962578',
    'UQ_EntityFormContribution_Key',
    'EntityID,ContributionKey,Scope,UserID,RoleID',
    '([ContributionKey] IS NOT NULL AND [Status]=''Active'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3a77ee84-7d24-4064-8bf9-9e6e025ee124',
    '139AB3B7-C1AB-49BD-A473-47D45A962578',
    'UQ_EntityFormContribution_RelatedClaim',
    'EntityID,RelatedEntityID,RelatedJoinField,Scope,UserID,RoleID',
    '([ContributionKey] IS NULL AND [RelatedEntityID] IS NOT NULL AND [Status]=''Active'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '974eefed-bbf5-48d5-bafe-cf7a400beaff',
    '15248F34-2837-EF11-86D4-6045BDEE16E6',
    'IX_SchemaInfo',
    'SchemaName',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'a46cb61d-0598-4c77-9fb6-53302a9b8057',
    '15248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_SchemaInfo_EntityNamePrefixSuffix',
    'EntityNamePrefix,EntityNameSuffix',
    '([EntityNamePrefix] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'd877712b-cf20-42cd-88e1-c32534102f15',
    '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0',
    'UQ_FileStorageAccount_Provider_Name',
    'ProviderID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c277e43e-3950-4130-bd14-0ba6ab7a57eb',
    '1816303E-6461-4E44-B929-EA467E2703DB',
    'UQ_APIKeyApplication',
    'APIKeyID,ApplicationID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'd44c373b-4996-40b8-ab5b-4f0bba8a8161',
    '1816303E-6461-4E44-B929-EA467E2703DB',
    'UQ_APIKeyApplication_APIKeyID_ApplicationID',
    'APIKeyID,ApplicationID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3f07d29b-eaba-490e-9d94-78615688c3a6',
    '19846E1A-FD8E-405F-A0FA-42A7AA44758D',
    'UQ_ArtifactPermission_Artifact_User',
    'ArtifactID,UserID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0cb75c6c-a602-4291-9d23-1083be69ddbf',
    '1A248F34-2837-EF11-86D4-6045BDEE16E6',
    'UX_QueryCategory_Name_NullParent',
    'Name',
    '([ParentID] IS NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3f44bbce-1d33-406f-9d27-36990d133900',
    '1A248F34-2837-EF11-86D4-6045BDEE16E6',
    'UX_QueryCategory_Name_ParentID',
    'Name,ParentID',
    '([ParentID] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c13cf113-a84b-464d-8768-cab1d8f22901',
    '1B248F34-2837-EF11-86D4-6045BDEE16E6',
    'UX_Query_Name_CategoryID',
    'Name,CategoryID',
    '([CategoryID] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'd638268c-28be-4592-bfab-f4a0651b1b87',
    '1B248F34-2837-EF11-86D4-6045BDEE16E6',
    'UX_Query_Name_NullCategory',
    'Name',
    '([CategoryID] IS NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '50040c78-86af-41bc-9533-352645f5fecf',
    '1B266740-F4DB-43A2-B75B-7A45ADB59709',
    'UQ_DashboardUserState_Dashboard_User',
    'DashboardID,UserID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '37028132-7e62-4580-b6d0-e714812f7818',
    '1C248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_QueryPermission_QueryID_RoleID',
    'QueryID,RoleID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '9003708c-03a0-462f-a7ec-aa95721177f8',
    '1F1EBDD5-84DA-4554-A029-87AFF327971D',
    'UQ_AIAgentSkill_Agent_Skill',
    'AgentID,SkillID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'df0536ed-9150-4856-9cee-16b295728696',
    '20BCABEC-413F-4985-8F5A-6BC262E75F81',
    'UQ_SearchScopeEntity',
    'SearchScopeID,EntityID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'f9845202-89ee-4516-a6f6-d3667eda26c1',
    '211DD116-32C7-43B4-B147-418F76B0E0E3',
    'UQ_SearchScopeProvider',
    'SearchScopeID,SearchProviderID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '9e081c9b-a373-4306-afc7-fdbed90f9ed3',
    '22248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_EntityDocument_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '54f99765-bf37-4a6f-9d53-9580b06647ed',
    '2264AA9A-2197-48E2-BB3D-A498006B37A5',
    'UX_ComponentLibrary_Name_Version',
    'Name,Version',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'a428f286-0da5-4c7a-b248-229f9953b5ed',
    '23248F34-2837-EF11-86D4-6045BDEE16E6',
    'IX_DataContextItem_DataContextID_CodeName',
    'DataContextID,CodeName',
    '([CodeName] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'de3983b4-59cb-4c6e-bf13-a3e3c9e395ca',
    '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7',
    'UX_AIAgentRelationship_Agent_SubAgent',
    'AgentID,SubAgentID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'aa9c0507-b614-43d2-9351-d40490425a35',
    '2758D216-C4D2-4FC4-8348-781372736159',
    'UQ_RemoteOperation_OperationKey',
    'OperationKey',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'fa5ebd12-3690-40f4-8662-3797e47f0c13',
    '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A',
    'UQ_WorkQueueMessage_PublishOrdinal',
    'PublishOrdinal',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '80386df2-a892-42bd-82f6-562007515a47',
    '2B248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_FileEntityRecordLink_EntityID_RecordID_FileID',
    'EntityID,RecordID,FileID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3fb11f86-94dd-48c8-92a4-255668b37e94',
    '2B559B5C-0E81-4EB8-80D8-26943E0A49BE',
    'UQ_WorkQueueDeduplication_Topic_Key',
    'TopicID,DeduplicationKey',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'edeeda80-098a-47b0-829b-3b4b3791ffbd',
    '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368',
    'UQ_CompanyIntegrationObjectField_Name',
    'CompanyIntegrationObjectID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'a9664e35-3680-4d53-83e3-5e5dee19aa7e',
    '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5',
    'UQ_AuthenticationProvider_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c13a2e80-e0f8-4a26-9b24-a8502d08f3aa',
    '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E',
    'UQ_RubricScaleLevel_Label',
    'ScaleID,Label',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'fe434b70-59dd-4c1b-80dc-2da29559040b',
    '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E',
    'UQ_RubricScaleLevel_Sequence',
    'ScaleID,Sequence',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'ea7a7e28-6144-492a-a3cd-876febb6ee7a',
    '31A90934-E8E7-4EF9-8430-D63E8F224ABD',
    'UQ_AIAgentChannel_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b1214e4c-5acc-4226-b900-ac5bbe9784f7',
    '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3',
    'UQ_AIAgentRubric_AgentRubricPurpose',
    'AgentID,RubricID,Purpose',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3164c1dd-d19f-4ae8-9d36-d5c78020af5c',
    '32248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_ApplicationSetting_ApplicationID_Name',
    'ApplicationID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '212e0df7-9168-4ba4-ac46-bf649b949737',
    '33C4F895-3313-4DA7-91E3-9D30AD19F4CD',
    'UQ_InstanceConfiguration_Key',
    'FeatureKey',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '5c583b9f-40ed-4621-8cd8-9d42003d361e',
    '33E01250-C0FE-4B35-AF8F-A4F444490065',
    'UQ_ScheduledJobType_DriverClass',
    'DriverClass',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '2afeee74-b2c7-46be-b6dc-559587ac20e4',
    '33E01250-C0FE-4B35-AF8F-A4F444490065',
    'UQ_ScheduledJobType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '028b2214-3e89-437e-939c-dd3f8eb8f86b',
    '347BAA45-90B3-4BFC-85F3-0435F10C113C',
    'UQ_ClusterAnalysisCluster_Analysis_Index',
    'ClusterAnalysisID,ClusterIndex',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1ace2266-c9f2-4630-bef5-edc561c4a6d2',
    '34987C4C-CC16-4AA3-B5BD-687C47ED78B2',
    'UQ_PermissionDomain_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'e21c7bb7-30dd-47e4-bdb5-af22ad63d2b5',
    '359389B4-54D1-46B2-AD9A-5B84750BAB0B',
    'UQ_AIAgentRequestType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '23e5bc69-4be1-496a-8a75-56b24973937a',
    '36248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_ActionAuthorization_ActionID_AuthorizationID',
    'ActionID,AuthorizationID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'e5298251-54a2-4ebc-bacb-cb76c03dc183',
    '3630CBFD-4C85-4B24-8A51-88D67389373E',
    'UQ_IntegrationObjectField_Name',
    'IntegrationObjectID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'bf4c54ac-1e3f-43e8-924c-74f00612c830',
    '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D',
    'UQ_MCPServerTool_ServerTool',
    'MCPServerID,ToolName',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'ae3d0d2e-7816-4ac9-9c69-8ab8497fb885',
    '37F31DED-1186-46E6-B3A5-052CB31A8651',
    'UQ_VersionLabelItem_LabelEntityRecord',
    'VersionLabelID,EntityID,RecordID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b97e79b5-bf4a-4ed8-bd06-2f4d0a7713bd',
    '38248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_Action_Name_CategoryID_ParentID',
    'Name,CategoryID,ParentID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c42cfb8b-c40a-453d-9fbb-3761776a9b1c',
    '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D',
    'UQ_AIAgentClientTool',
    'AgentID,ClientToolDefinitionID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'fa58125a-5a5f-400f-b8f4-85893e1ba865',
    '38B82609-4B90-477B-801B-BC4154A8DE39',
    'UQ_EntityAlternateBaseView_EntityID_Name',
    'EntityID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '7a341735-3fe0-4c53-ad37-85fd1547021f',
    '38D9DE43-C0C2-45DA-81BB-A815B30F86FB',
    'UQ_IdentityClaimType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '72b895da-ff9b-4766-91fb-4cc5f4b958bc',
    '3BED585D-B150-4899-AB06-8A19624EA9BE',
    'UQ_FeatureValue_ValueKey',
    'RecordProcessID,ValueKeyHash',
    '([ValueKeyHash] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'ad7454a4-edcf-452d-a5ab-436beae59e10',
    '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2',
    'UQ_Country_ISO2',
    'ISO2',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'a2c5465a-17ae-4667-a252-6fcd226806c4',
    '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2',
    'UQ_Country_ISO3',
    'ISO3',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b99a64f7-9faf-4c19-9cdf-4fec02a56fca',
    '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2',
    'UQ_Country_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'a9f9e11b-4635-433c-8c86-09e6c6a5234b',
    '3C30FA05-9490-49F0-8943-6052573C66B2',
    'UQ_CompanyIntegrationObject_Name',
    'CompanyIntegrationID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '376c8a40-eaeb-470b-9f1e-aa149325e867',
    '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E',
    'UQ_MCPServerConnection_CompanyName',
    'CompanyID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3a10a5a1-2435-4a75-b2e6-dbae48815773',
    '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5',
    'UQ_ContentItemDuplicate_Pair',
    'ContentItemAID,ContentItemBID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '377097db-17cb-4470-9bb0-a46714211d9b',
    '3D08228D-8D64-46D3-AED9-AABD54BBBDBE',
    'UQ_QueryParameter_QueryID_Name',
    'QueryID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c7de8df1-0833-46c8-94c6-cf8c7e10ee74',
    '3D248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_ActionContext_ActionID_ContextTypeID',
    'ActionID,ContextTypeID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'e3d78d6b-51d0-4131-b34f-5a61c5ed6551',
    '3F248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ__ActionPa__FC8BBBBD6F2DCAC4',
    'Name,ActionID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0c826ed6-2cf0-43d2-a35e-7a9ceed2d1d7',
    '3F83C084-859F-49C3-A8A0-4693E0777BE8',
    'UQ_SearchScope_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'be9fc65f-3071-47cb-aa64-82c7c2015d81',
    '3FE3016C-1E34-4510-9A68-7B1664F58217',
    'UQ_MCPToolFavorite_User_Tool',
    'UserID,MCPServerToolID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '53ba2943-0172-441e-8583-a51c414d79c2',
    '40248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_ActionLibrary_ActionID_LibraryID',
    'ActionID,LibraryID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'bb0ec346-9e67-4f8a-8683-efb35383fe63',
    '406BA963-D9A0-4093-AF02-59835BFE1FFF',
    'UK_ListShares_List_User',
    'ListID,UserID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0563f2bc-5cac-44ae-82fe-47adeb4a830e',
    '41248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_Library_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'f8ecc35c-64b9-4900-b62e-310166795780',
    '43248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_CommunicationProvider_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'fec3e646-49a6-4df3-bdb8-f30a459148b5',
    '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A',
    'UQ_AIModelArchitecture',
    'ModelID,ArchitectureID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b9361108-2255-4844-b122-98fd22ec30f4',
    '47248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_CommunicationBaseMessageType_Type',
    'Type',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '76d7ae15-186d-4aec-abbb-66f24c7e844e',
    '49770E19-D6D0-485D-A03F-01C39FDFB6D1',
    'UQ__Generate__737584F6DF502163',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'd165271d-0858-4a43-a923-df2513a67b8d',
    '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D',
    'UQ_RubricCriterion_Key',
    'RubricVersionID,Key',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c8240f08-9b5a-4bfc-b0a1-7ed6a7cd2863',
    '4A6907AB-B05C-4140-A612-2A580FEB94D0',
    'UQ_DashboardPartType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3332745f-0d28-451b-8778-983a9df41c5b',
    '4B35F25F-D5E7-4489-B722-29B75AF384A8',
    'UQ_UserNotificationPreference_UserType',
    'UserID,NotificationTypeID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '835a5e48-f4c7-4da6-8273-a02572f1d735',
    '4B414728-C375-4CB4-987D-1B6A440FD239',
    'UQ_CalendarSyncState_Calendar',
    'CommunicationProviderID,AccountIdentifier,CalendarID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '05396d24-e6e0-49bb-b005-a0f103d7f638',
    '4D68E78E-64F7-4959-B18B-72159DF95A98',
    'UQ_RecordProcessWatermark_Record',
    'RecordProcessID,EntityID,RecordID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '02186465-5a86-4814-ae46-295f7b304841',
    '4F35743A-2413-47FB-9A36-B5BECB038BBF',
    'UQ_AIArchitecture_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3ed3bf47-665c-4b4c-8ce8-5eeb5e9fad1b',
    '4F51DAE4-4F4D-444A-B931-4F29AB2A871A',
    'uq_AIModelPriceType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'e4f0acb1-bc7b-4730-a056-1b7c85649fbf',
    '51248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_EntityCommunicationMessageType_BaseMessageTypeID_EntityID',
    'BaseMessageTypeID,EntityID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '34993766-9167-42cd-a108-2eb439fc9336',
    '517DC830-DD35-4756-B1AE-EFF5046B2837',
    'UQ_RubricScale_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'a2ff5425-e323-487c-9ed7-d7e71197032d',
    '53695C5D-E659-4025-825A-23C5FA873B6A',
    'UQ_FormChromeRule_Contribution',
    'EntityID,ContributionKey',
    '([TargetKind]=''Contribution'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '8cb4017f-f980-43c3-abd7-ef0147697283',
    '53695C5D-E659-4025-825A-23C5FA873B6A',
    'UQ_FormChromeRule_Relationship',
    'EntityID,RelatedEntityID',
    '([TargetKind]=''Relationship'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '9e0bd25d-3e4b-43b5-9269-726c2d52c044',
    '54EF915A-9902-4958-8E09-AE6E7B525E97',
    'UQ_RecordGeoCode_EntityRecordLocation',
    'EntityID,RecordID,LocationType',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'e6a184d4-1285-4aaa-ac3a-da33ae8eb8ff',
    '55248F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ__EntityRe__737584F667950678',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '497fe3e0-c419-4740-9ccd-fd7db66b7bdc',
    '55E5A944-6ECD-491D-A4E9-99E1453FEBDB',
    'UQ_CollectionPermission_Collection_User',
    'CollectionID,UserID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3f413bc3-4c13-4214-bf07-86ca87cd0723',
    '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D',
    'UQ_AIModality_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '4aad5bf4-5498-4c87-85de-ed709316637c',
    '57801845-6620-4CBD-993F-E4AA2D464A04',
    'UQ_IntegrationSourceType_DriverClass',
    'DriverClass',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b3a4e7f1-74b2-450c-9a62-334fc31d41db',
    '57801845-6620-4CBD-993F-E4AA2D464A04',
    'UQ_IntegrationSourceType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '48f15798-dbfe-4e67-ba71-7055b0719284',
    '57A740FA-CE0F-440B-8B90-6BF2BB9440DE',
    'UQ_OpenAppDep',
    'OpenAppID,DependsOnAppName',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c5c5d123-60a8-4f62-af33-1f07b7e7479e',
    '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C',
    'UQ_NumberPool_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '51f43ea7-55a3-44b7-b5ea-f97fd03422c0',
    '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2',
    'UQ_AIRemoteBrowserProvider_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '9b583b86-7709-43fc-a0de-572ea8760ea3',
    '5C937C69-CD63-456F-9CC8-D860BB8F6B16',
    'UQ_FeaturePipelineType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '8652a532-35dc-40ec-9f39-c354bc4dcb58',
    '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A',
    'UQ_InteractionLink',
    'InteractionID,EntityID,RecordID,Role',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '6cc37f9a-4ee1-40ba-9e25-c2d87dc81608',
    '5D4BC8D7-AB3F-444E-B85A-FC89297887B2',
    'UQ_ArtifactVersionAttribute_Version_Name',
    'ArtifactVersionID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '8ceb54f2-9c4a-4c6f-bb43-98ec7da4115a',
    '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A',
    'UQ_AISkillAction_Skill_Action',
    'SkillID,ActionID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '777f87da-0739-4a3b-a2c4-02d5327d2ed9',
    '619F0CE1-795C-4B20-9E08-3C45F179AEB5',
    'UQ_WorkQueueTransport_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '81372378-4334-45f1-b850-c6bd6c083d1b',
    '62925804-D598-45A7-A338-B2604AE96F11',
    'UQ_AIAgentUserPolicy_Agent_User',
    'AgentID,UserID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'f5942831-ca30-48c2-ae7c-9c764590646b',
    '635C7C9A-7BBB-4836-AA19-3E54963E2821',
    'UQ_AIPersonaVendor_Persona_Vendor_Modality',
    'PersonaID,VendorID,ModalityID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1d2d469b-198e-4082-865e-9e7eaa435a5d',
    '65CDC348-C4A6-4D00-A57B-2D489C56F128',
    'UK_AIAgentType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '85a2072e-1657-4d0a-892d-d0b5205b12fd',
    '6AE1BBF0-2085-4D2F-B724-219DC4212026',
    'UQ_AIConfiguration_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'baed78fe-55ee-4cd5-a757-068ddc20621d',
    '6B8A7C62-C13B-4283-9C81-17D9233A4A69',
    'UQ_AIAgentCategory_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'd7d83ed9-4457-445f-8840-518ecd3ea150',
    '6BAB48BD-F197-4737-93A6-8081BBBAEB30',
    'UQ_PublicLink_Token',
    'Token',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'af5d9ac1-d725-420c-8def-ed28b97c3212',
    '6D3D08A7-12F2-42EA-BD15-128FBE4A4259',
    'UQ_ApplicationRole_App_Role',
    'ApplicationID,RoleID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'afdc06c5-bb0c-41a8-a3ed-951ff87f7c57',
    '6DC12139-38A1-43C6-85EE-8066450E762B',
    'UX_InteractionOffer_OneAccepted',
    'InteractionID',
    '([Status]=''Accepted'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '744ed55d-ad02-4b14-99ce-38e6e1fa1eca',
    '703330A7-2C34-4BD4-9224-4DE10BB179F3',
    'UQ_EncryptionAlgorithm_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1ac7e6ad-d649-4ab8-a21e-d05b9448e72e',
    '72AC67C3-5FD0-4320-AB49-813697181A54',
    'UQ_AIAgentModality',
    'AgentID,ModalityID,Direction',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '902d6302-7594-4585-92cd-e578d33afb6a',
    '771ED81A-B504-4027-B223-CA3ABBAA3C75',
    'UQ_DashboardPermission_Dashboard_User',
    'DashboardID,UserID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '13ace57e-125b-48ed-adae-91a79a998ed2',
    '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21',
    'uq_AIModelPriceUnitType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1ccf7fe2-6557-4fdb-ab1f-44d6ede933e5',
    '7AA13345-ACE3-403F-8F5A-CB742AB1C631',
    'UQ__UserNoti__737584F6568AC292',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c00fe080-f01b-4ebe-b98f-bcabb0ae086a',
    '7AF734B5-579B-4E61-BC1D-38827BB5C465',
    'UQ_APIApplication_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '82f2bdfa-dae5-409a-b656-bc2d72eba5ad',
    '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56',
    'UQ_WebSearchProvider_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '6dc46669-140d-458f-9bab-14b33b0e9d56',
    '7BD06B14-122D-426E-A796-1DBE64FA4F60',
    'UQ_TaskType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '14c9e610-e3a3-495c-b3c0-e59477577353',
    '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
    'UQ_Credential_TypeName',
    'CredentialTypeID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '082d8ac2-7a2d-4dd5-9daa-badd0d668207',
    '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2',
    'UQ_SignatureProvider_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'fea8f0eb-cb21-4fc0-9cab-eddbc152f8b4',
    '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77',
    'UQ_AIBridgeAgentIdentity',
    'ProviderID,IdentityValue',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '624c99f3-2132-40a3-80d7-f949fa3ab7a2',
    '82D34EEC-685A-490E-B26B-897836709026',
    'UQ_AIAgentHarness_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c39dd654-f811-4ab1-bb4a-c8eb10dc7e68',
    '83DBF4CB-56FE-496F-A5DF-1FC7BF616653',
    'UQ_ArchiveConfigEntity_ConfigEntity',
    'ArchiveConfigurationID,EntityID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '6f644b92-515b-415b-bede-c184b0707461',
    '840A51D1-7436-45F9-9176-31E1FE785635',
    'UQ_AIBridgeProvider_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '93c18514-9fd0-4c2b-a2ad-46677d68f476',
    '854DB803-34D4-46CD-8B8D-712974AE592F',
    'UQ_EncryptionKey_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '4fe4fa95-6d79-4af2-850f-ff6cf39198eb',
    '86D3ED6F-2D1D-43F6-9777-FD9672FA9021',
    'UQ_IntegrationObject_Name',
    'IntegrationID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'bd8f8277-2a90-426f-80d8-c038741f4ba6',
    '88026538-D440-48F5-9FE8-A8A7198DBF83',
    'UQ_ConversationWidgetInstance_PublicKey',
    'PublicKey',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '2dd27220-d56a-4d04-b871-ec92a552a636',
    '885C7B1F-57BA-4BD1-B2FD-0D47AAC56FDA',
    'UQ_TestType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0e4c9332-c1e8-4c87-8548-a12882971f26',
    '890BDDC2-36D4-4330-9D37-655655E3491E',
    'UQ_AIAgentSessionChannel',
    'AgentSessionID,ChannelID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c0d02262-aeea-4401-a2d0-b84750b31cd9',
    '8D7A7BD5-95E8-428C-874A-3829BAD6685E',
    'UQ_PhoneNumber_Number',
    'Number',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'cc0fb182-3340-4613-b7d3-a8d5b7799041',
    '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2',
    'UQ_AIAgentPersona_Agent_Persona',
    'AgentID,PersonaID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'f28bd900-be3e-4327-b613-0d2a2f776757',
    '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2',
    'UQ_AIAgentPersona_OneDefaultPerAgent',
    'AgentID',
    '([IsDefault]=(1))'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '277ca687-85b2-46b5-9cea-2e3b7c2badaa',
    '91797885-7128-4B71-8C4B-81C5FEE24F38',
    'UQ_ArtifactType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'dc8caa71-876f-4d7a-b9b5-71e5d606d835',
    '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B',
    'UQ_ComponentLibraryLink_ComponentID_LibraryID',
    'ComponentID,LibraryID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3fc90e8d-5dc6-48c7-a496-fae1ce8758c4',
    '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B',
    'UX_ComponentLibraryLink_Component_Library',
    'ComponentID,LibraryID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'd2d0f1cb-ff75-4035-8207-ca9483dc1f47',
    '99F3E501-8443-4C39-9D4C-77F712B1ACA1',
    'UQ_AIPersona_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '16993917-654e-403a-8798-102f5d3cf44b',
    '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3',
    'UQ_AIAgentConfiguration_Agent_Name',
    'AgentID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0da51d80-d978-428f-88fc-45f811d25a9c',
    '9E05B993-96A3-4E96-BE9B-60C644D575CF',
    'UQ_AIAgentArtifactType_Agent_ArtifactType',
    'AgentID,ArtifactTypeID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b0f20c47-2e70-461e-b264-47a990293744',
    '9E05B993-96A3-4E96-BE9B-60C644D575CF',
    'UQ_AIAgentArtifactType_AgentID_ArtifactTypeID',
    'AgentID,ArtifactTypeID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '760f1ef9-2c69-4483-b0f3-ecd4fc421f4f',
    'A159B8C9-4941-4AD3-9FC3-A9BC07299206',
    'UQ_MCPServer_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'a450fd63-887b-47a0-8a28-9c1e8f443071',
    'A60434B6-1893-45ED-9ECB-169EE8FE6241',
    'UQ_RubricVersion_Number',
    'RubricID,MajorVersion,MinorVersion,PatchVersion',
    '([MajorVersion] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '81136faf-c696-40e4-964d-82e48a6f284d',
    'A60434B6-1893-45ED-9ECB-169EE8FE6241',
    'UQ_RubricVersion_OneDraft',
    'RubricID',
    '([Status]=''Draft'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '91a6922f-5d69-4621-b70a-95e6ba164df1',
    'A712FD9C-DCA3-4409-9F4E-0ABE70D25439',
    'UQ_ComponentDependency_ComponentID_DependencyComponentID',
    'ComponentID,DependencyComponentID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '8e5b2d18-63d1-494e-ae33-d0ce6977b610',
    'A712FD9C-DCA3-4409-9F4E-0ABE70D25439',
    'UX_ComponentDependency_Component_Dependency',
    'ComponentID,DependencyComponentID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'a9c9d57a-7ce9-4f2f-9cba-28fe44ebea3a',
    'A75F1DD8-2146-4D03-AA7F-50D048E44D11',
    'UQ_MCPServerConnectionTool_ConnectionTool',
    'MCPServerConnectionID,MCPServerToolID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '6d43dfb3-2556-4bba-9fc1-a42b8f865110',
    'AA4ADD02-7763-44CE-B07D-0CF74708749C',
    'UQ_AISkillSubAgent_Skill_SubAgent',
    'SkillID,SubAgentID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '7b901158-31de-434a-b006-f4c5f3bd247a',
    'AB9ECA24-70B0-49B8-80CB-0D57C6E63339',
    'UQ_MaterializedResultQuery_MaterializedResult',
    'MaterializedResultID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '8adb1a73-6249-43a7-97dd-39ba2ca97147',
    'AB9ECA24-70B0-49B8-80CB-0D57C6E63339',
    'UQ_MaterializedResultQuery_Query',
    'QueryID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'e5b21fed-054b-479c-a736-b005384d78fa',
    'AC4A2799-454B-4395-AA56-A42241F32C12',
    'UQ_OpenApp_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'f1206442-3c64-4f50-ae11-4f4649192815',
    'AC4A2799-454B-4395-AA56-A42241F32C12',
    'UQ_OpenApp_Schema',
    'SchemaName',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '515f1cd1-5cf0-4a2a-9375-d9bc4e3534f7',
    'AD4D32AE-6848-41A0-A966-2A1F8B751251',
    'UQ_AIPromptModel_Prompt_Model_Vendor_ConfigID',
    'PromptID,ModelID,VendorID,ConfigurationID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '83a8d0ac-3e52-4348-88be-834a856ffb20',
    'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01',
    'UQ_ArtifactVersion_ArtifactID_VersionNumber',
    'ArtifactID,VersionNumber',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '560cac5c-9ad7-437b-97fc-32d0da7f6d8f',
    'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2',
    'UQ_Rubric_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0d111a64-d42f-44e3-8b17-078fd94d7e6e',
    'B51CF0E1-2A79-407E-B716-610A608BADAE',
    'UQ_ConversationArtifactVersion_ArtifactVersion',
    'ConversationArtifactID,Version',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'e5933648-62e1-4d6e-9369-43b632af0b85',
    'B56DB373-2982-4E91-AACB-075CB8BECBBB',
    'IX_APIKey_Hash',
    'Hash',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0df9c859-a4b6-45ad-815f-d0cee5999784',
    'B56DB373-2982-4E91-AACB-075CB8BECBBB',
    'UQ__APIKey__607056C13AF1E3CE',
    'Hash',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '4c3b3cbe-6dd9-4c5e-96b7-6e4967f492de',
    'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5',
    'UQ_MagicLinkInviteAllowedPath',
    'InviteID,Path',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3de75531-f1ff-4fee-a6c1-1de11cda8048',
    'B90FAB4E-0336-407A-B6AE-A49DEA84D083',
    'UQ_SearchScopePermission_Role',
    'SearchScopeID,RoleID',
    '([RoleID] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'f75550bf-b34c-49ed-975e-8d09feff1f5c',
    'B90FAB4E-0336-407A-B6AE-A49DEA84D083',
    'UQ_SearchScopePermission_User',
    'SearchScopeID,UserID',
    '([UserID] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1740c080-9742-486b-8e6d-9ca7d05ee49b',
    'B931BF66-BB79-4E82-8324-5BE7C1D65E12',
    'IX_MCPServerConnectionPermission_Role',
    'MCPServerConnectionID,RoleID',
    '([RoleID] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '8a1fdfa4-53f0-4924-b420-5a43de76dda5',
    'B931BF66-BB79-4E82-8324-5BE7C1D65E12',
    'IX_MCPServerConnectionPermission_User',
    'MCPServerConnectionID,UserID',
    '([UserID] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'e0aae189-8942-4d2f-a1bf-25e7bcb777d4',
    'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F',
    'UQ_AIVendorType_VendorID_TypeID',
    'VendorID,TypeID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '6863d6f8-8b42-498b-a923-e0ded2f480ad',
    'C084B950-88AD-4922-9F59-B8D5C2F36988',
    'UQ_AISkillSearchScope',
    'SkillID,SearchScopeID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '58df4f9f-d08b-4477-944d-c02c2ca13416',
    'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1',
    'UQ_AIVendorTypeDefinition_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '78cd4c4f-d453-4d4d-b3fe-6a73a2370e61',
    'C218C9B9-D7A6-4901-B073-FF25DD613F35',
    'IX_AIAgentDataSource_AgentID_Name_Destination',
    'AgentID,Name,DestinationType,DestinationPath',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '79d7bfb0-dd85-43f0-9e24-5e4ebb1b9496',
    'C353DB72-DE7C-4674-98D0-D4DDB9D41571',
    'UQ_TagCoOccurrence_Pair',
    'TagAID,TagBID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '5d423547-7bca-409c-84be-5ce02df71896',
    'C66B6327-ECF6-47F8-A11B-B4D5E154AE51',
    'UQ_MagicLinkInviteAllowedDomain',
    'InviteID,Domain',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3c2d7c98-8b97-4dff-b2c2-2a6ac1c24389',
    'C6988FA5-1EE9-40EE-9BA6-3096CB832208',
    'UQ_MagicLinkInviteApplication',
    'InviteID,ApplicationID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '489b6ae0-74e1-43e9-aef2-fc4a49896b58',
    'C6CD026F-239F-4CA8-9ADC-50E5B81EF230',
    'UQ_SQLDialect_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '79f5400d-fe07-4f85-a20f-60bda9b7c3e3',
    'C6CD026F-239F-4CA8-9ADC-50E5B81EF230',
    'UQ_SQLDialect_PlatformKey',
    'PlatformKey',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '61e712ce-25ea-49db-b52c-f97ebe850d28',
    'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111',
    'UQ_CollectionArtifact_Collection_Version',
    'CollectionID,ArtifactVersionID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '14a87b85-6076-4172-be28-5d038b7e9ba1',
    'C7A44D04-4B50-4106-BF58-9E0C430906F4',
    'UQ_DashboardCategoryPermission_Category_User',
    'DashboardCategoryID,UserID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '603f07da-e143-4460-85c5-b627dab9edaa',
    'CA9E4797-3E8A-4942-AFE9-274CD49872A7',
    'UQ_FeaturePipelineVersion_Pin',
    'RecordProcessID,PinHash',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c7a6f28e-107e-40c4-bf40-994b8ccd5abf',
    'CA9E4797-3E8A-4942-AFE9-274CD49872A7',
    'UQ_FeaturePipelineVersion_Version',
    'RecordProcessID,Version',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1750a1a5-c453-4859-a948-119d5b9dfd2a',
    'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A',
    'UQ_QueryDependency',
    'QueryID,DependsOnQueryID,ReferencePath',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '61ebb748-aa16-481c-bf64-19bb9edd73f6',
    'CDADE3E4-D00A-42E7-B385-CE24D533101E',
    'UQ_ExternalDataSourceType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0f10c0c0-ffdb-4a81-b6fb-18a0d4c0ebf3',
    'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6',
    'UQ_TestRunOutputType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '10d9ea8d-85c4-4547-81b8-c90625f72ba7',
    'D0A12FDF-8956-419C-81DF-37A0127A60D2',
    'UQ_WorkQueueDelivery_InFlightPartition',
    'SubscriptionID,PartitionKey',
    '([Status]=''InFlight'' AND [PartitionKey] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c39c8dcc-f947-485c-93bc-43b9dad99a1d',
    'D0A12FDF-8956-419C-81DF-37A0127A60D2',
    'UQ_WorkQueueDelivery_Subscription_Message',
    'SubscriptionID,MessageID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'd7b2ab53-ab46-4397-9005-0141d9859ef2',
    'D2021771-50D7-4E0F-A2A8-27AC37E01B34',
    'UQ_ConversationSkill_Conversation_Skill',
    'ConversationID,SkillID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '7ffb776d-ccfe-48cb-895a-5bc658b51da8',
    'D2A67D87-F495-43E3-A91B-5A46E5553C31',
    'UQ_Meeting_RoomName',
    'RoomName',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1c4acbb1-7ced-400c-98f1-d0a2cead3748',
    'D4238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_Company_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b6b9c64a-2ac5-426b-9974-73404a724a3c',
    'D512FF2E-A140-45A2-979A-20657AB77137',
    'UQ_CredentialType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '94402706-695d-47fb-860f-1cd37b4c9eaf',
    'D5238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ__Employee__Email',
    'Email',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1ed73a3b-1b8a-43e6-8d2a-0a7b6f8b7c0e',
    'D5493024-2F38-47A5-A6F2-B468A64640AD',
    'UQ_AIModelPersona_Model_Persona',
    'ModelID,PersonaID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'caa8e4a4-de71-493b-b48c-7e7ae0776f5a',
    'D5C4FEF3-21D0-4A41-893B-34F9527195F0',
    'UQ_CompanyIntegrationSyncWatermark_EntityMap_Direction',
    'EntityMapID,Direction',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '2bf3a4c7-2009-4adb-ad47-9ff27523b37e',
    'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F',
    'UQ_EntityUniqueKey_EntityID_Name',
    'EntityID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '7ec9c135-fea9-409a-92a7-cba558abd67f',
    'D8238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_EmployeeRole_EmployeeID_RoleID',
    'EmployeeID,RoleID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '46af4659-1ea6-4c2c-9b19-a49d88859725',
    'D9238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_EmployeeSkill_EmployeeID_SkillID',
    'EmployeeID,SkillID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'bf7af18c-5d35-44ee-a318-2a8060d8e1f4',
    'D95A17EE-5750-4218-86AD-10F06E4DFBCA',
    'UQ_AIVendor_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0ad6e254-ed70-4a38-9952-41f31bf3fc0a',
    'DA238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ__Role__737584F6A210197E',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '898e8e67-1c86-4106-86fd-f11fe781049e',
    'DC90010A-21CF-4F61-AF37-F528E4B31AA2',
    'UQ_DashboardCategoryLink_Dashboard_User_Category',
    'DashboardID,UserID,DashboardCategoryID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1457d17e-ad84-4001-afde-0c256a832aaa',
    'DD238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_Integration_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '956beeff-50b3-414c-9bb9-94e58f87827b',
    'DD6EE217-00EC-4DE8-A2E6-489A08D4E524',
    'UQ_TaskDependency_Pair',
    'TaskID,DependsOnTaskID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '9b90a3ab-6f3a-4cf8-93e8-705d48cedbb1',
    'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B',
    'IX_DashboardUserPreference_App_Default',
    'DashboardID,ApplicationID',
    '([UserID] IS NULL AND [Scope]=''App'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'ae267af4-3333-4610-b3cb-1270d661c8e1',
    'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B',
    'IX_DashboardUserPreference_App_User',
    'UserID,DashboardID,ApplicationID',
    '([UserID] IS NOT NULL AND [Scope]=''App'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b8c48f2b-bf6c-4806-bf8c-e7865aa0fe12',
    'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B',
    'IX_DashboardUserPreference_Global_Default',
    'DashboardID,Scope',
    '([UserID] IS NULL AND [Scope]=''Global'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '2eb4e020-dea6-4c66-b32a-db200749335a',
    'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B',
    'IX_DashboardUserPreference_Global_User',
    'UserID,DashboardID,Scope',
    '([UserID] IS NOT NULL AND [Scope]=''Global'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '604be927-3509-4a9b-a8e3-bb3eb77308a4',
    'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E',
    'UQ_ConversationDetailRating_User',
    'ConversationDetailID,UserID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'ab941615-11c6-44e9-b4ab-36475dcd9a42',
    'DF238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_EntityField_EntityID_Name',
    'EntityID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b94f69e4-ca64-4df1-aa20-7868c92bf1c0',
    'DF238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_EntityField_EntityID_Sequence',
    'EntityID,Sequence',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'f6050a52-3042-45b8-b4ca-6f573177a4e9',
    'E0238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_Entity_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'e038d5be-50e3-44ed-870b-3e0da5da0efd',
    'E1238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_User_Email',
    'Email',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '580ec0b5-be0c-46a6-b1fc-c8ad044d5c78',
    'E1A36CEA-8AD9-442A-84D6-23A1B38BC278',
    'UQ_EncryptionKeySource_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'df0f81bc-c1eb-47d6-8b59-8388bf4b9e00',
    'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79',
    'UQ_FeatureValueCache_PromptScoped',
    'PromptID,PromptVersionHash,ConstraintHash,AIModelID,ParametersHash,KeyHash',
    '([RecordProcessID] IS NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '299ec432-3692-4301-a17e-fb080b16eeed',
    'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79',
    'UQ_FeatureValueCache_Scoped',
    'RecordProcessID,PromptID,PromptVersionHash,ConstraintHash,AIModelID,ParametersHash,KeyHash',
    '([RecordProcessID] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1c050f42-55ec-44db-b35d-8fbb1165373f',
    'E29013E4-93D3-4001-921C-DC1F745F8DD5',
    'UQ_ViewType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '6cf576aa-3833-419d-9ae2-2bfd64d8a894',
    'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107',
    'UQ_RubricBand_Label',
    'RubricVersionID,Label',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '6f21a297-b5d9-4a12-9d4d-84e3e6a37c73',
    'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A',
    'UQ_MagicLinkInvite_TokenHash',
    'TokenHash',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'f1661131-f57f-46c4-9e3b-29b35353a3f7',
    'E6C72108-A52B-4162-B0C3-CC6CFECD642D',
    'UQ_AIBridgeProviderChannel',
    'ProviderID,ChannelID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '63683312-2326-4245-9ea4-3240d35150ad',
    'E6FF1529-89B9-452B-9703-FF26F9E8AA18',
    'UQ_OAuthToken_Connection',
    'MCPServerConnectionID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '31fd92e3-8f1c-4268-866a-deccaf988099',
    'E8238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_Application_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '1a97ac9e-85bd-4de7-bbdc-2c2d5257b6ae',
    'E8238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_Application_Path',
    'Path',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '74d9d051-c103-4cf5-887a-ef9aed329eae',
    'E857C741-5B84-4012-8C19-821FC0246EE7',
    'UQ_AIModelModality',
    'ModelID,ModalityID,Direction',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '80a45e13-1175-4418-9790-98f1547c5d0c',
    'E9238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_ApplicationEntity_ApplicationID_EntityID',
    'ApplicationID,EntityID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '61587b89-c7ca-4a15-b03d-7b2af8e61f05',
    'E9D66E45-4771-4D80-97D4-42007B9951FB',
    'UQ_MagicLinkInviteRole',
    'InviteID,RoleID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '7cf4647c-1255-4175-92bd-3bb9f1732116',
    'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA',
    'UQ_ConversationArtifactPermission_ArtifactUser',
    'ConversationArtifactID,UserID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '68a9a4c2-416f-40fa-81bd-fec1503d5ee0',
    'EA238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_EntityPermission_EntityID_RoleID_Type',
    'EntityID,RoleID,Type',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '49fc1cf4-afd6-40bc-846b-99591efc08cc',
    'EA41DE76-F03F-4335-A98D-FACFA37AFB1C',
    'UQ_TagScope_Tag_Entity_Record',
    'TagID,ScopeEntityID,ScopeRecordID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '35301809-85ea-4b40-b5a0-2867620cce21',
    'EA592498-EC43-4853-878D-4B44D19581E5',
    'UQ_OAuthAuthServerMetadataCache_IssuerURL',
    'IssuerURL',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'fb4dcdc5-2259-439b-9687-d8a5515b7df6',
    'EB238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_UserApplicationEntity_UserApplicationID_EntityID',
    'UserApplicationID,EntityID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'edf2cdee-ad6d-46f3-bae1-76990a379985',
    'EBAED427-2514-46B1-A20C-777A2055C937',
    'UQ_AIAgentSessionRecordingShard_Session_Index',
    'AgentSessionID,Index',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3b4c2c9e-1907-4b44-9c3c-c3681dfbcf69',
    'EC238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_UserApplication_UserID_ApplicationID',
    'UserID,ApplicationID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '47fe5900-34e5-4d4a-8806-c1d093b94129',
    'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7',
    'UQ_RubricCriterionLevel_AnchorValue',
    'CriterionID,AnchorValue',
    '([AnchorValue] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '3def8996-ac92-4f26-a45f-bef6196705e6',
    'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7',
    'UQ_RubricCriterionLevel_ScaleLevel',
    'CriterionID,ScaleLevelID',
    '([ScaleLevelID] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'f4ae7d96-1127-4cdd-b92e-f29ba9ac66ae',
    'ED243F59-106C-4020-A334-5BAD0CCF7987',
    'UQ_EOKRE_KeyEntity',
    'EntityOrganicKeyID,RelatedEntityID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b1eaa91e-d73e-4a57-8caf-7a2023fb79c8',
    'EF238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_ListDetail_ListID_RecordID',
    'ListID,RecordID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '18253d78-4a55-4426-84ea-a26c5b2668c9',
    'EF86F759-B7F0-4D5D-A594-8BC395129ACF',
    'UQ_OAuthAuthorizationState_StateParameter',
    'StateParameter',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'e2a0ada0-7d73-4d00-a663-27e1b4ba9ba3',
    'F1741CE5-EACA-492D-9869-9B55D33D9C29',
    'UQ_APIKeyScope',
    'APIKeyID,ScopeID,ResourcePattern',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '8fe3514a-c03d-473b-9816-69fc7e68e43a',
    'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF',
    'UQ_APIApplicationScope',
    'ApplicationID,ScopeID,ResourcePattern',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '00109708-b340-474d-8d90-23e0a826d717',
    'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB',
    'UQ_Theme_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b8342cb0-288f-4d9c-a498-99fd8b48860c',
    'F386546E-EC07-46E6-B780-6B1FEA5892E6',
    'UQ_AIModelVendor_ModelID_VendorID_TypeID',
    'ModelID,VendorID,TypeID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '251f4ffe-af71-43ad-b83f-0d0733eadc2c',
    'F4D03836-2513-4E94-9BA4-0CD3D968B849',
    'UQ_WorkQueueTopic_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '8f9753c1-64a1-4898-829f-63e77d36a2a2',
    'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D',
    'UQ_EntityFieldPermission_Field_Role',
    'EntityFieldID,RoleID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '99cfb6d7-01b0-47d2-ac62-7b1f8c347caa',
    'F75584C0-1BB2-4645-AA4C-24D35B43D45A',
    'UQ_WorkQueueSubscription_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0310634e-f30e-4797-b229-44b068ee0d09',
    'F9238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_Authorization',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'f21b29d8-f8b2-4415-ae4d-d6c20872bdb7',
    'FA238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_AuthorizationRole_AuthorizationID_RoleID',
    'AuthorizationID,RoleID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0af8ead6-60f7-441d-8a42-4d7e8679fceb',
    'FB238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_AuditLogType',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b4743192-6912-4917-88f9-6da5b2ccff80',
    'FC9FC6E4-D9D3-4D3F-A0AE-46A10B11034B',
    'UQ_TestRubric_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '7aac9d97-39da-4bdb-a7c4-b81ab3bfc8c6',
    'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0',
    'UQ_TagSynonym_Tag_Synonym',
    'TagID,Synonym',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '33a056e1-de1f-4b4a-a282-1471dd5c8dc1',
    'FE37218E-259F-47F2-909D-9AECBE5385DB',
    'UQ_QuerySQL_Query_Dialect',
    'QueryID,SQLDialectID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'b8b096c5-50fb-4387-9fd8-9ad9d09177ae',
    'FF238F34-2837-EF11-86D4-6045BDEE16E6',
    'UQ_AIModelAction_AIActionID_AIModelID',
    'AIActionID,AIModelID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '8c9dc15f-d84f-4c83-9b03-f9971e40f7aa',
    'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B',
    'UQ_AIClientToolDefinition_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '4da93ecd-7d2b-4c30-8e8f-5e7ddbf77539',
    '03BDCB52-1A3A-408A-8079-879493A8598A',
    'UQ_GraphEdge',
    'GraphID,EdgeTypeID,SourceEntityID,SourceRecordID,TargetEntityID,TargetRecordID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '6c01e108-bd3d-4bc0-b424-e2aedffdcf12',
    '0A75D64D-9396-4B77-871A-D88577F2AC4F',
    'UQ_DiagnosticSenderRegistration_InstallID',
    'InstallID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '738ca288-1df3-4e82-af79-4f210c782caa',
    '11579CD9-246E-416F-8915-61CF7B77842F',
    'UQ_GraphEdgeTypeEndpoint',
    'EdgeTypeID,Side,EntityID',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '92e881e5-39ab-48ed-a870-b536965e74ff',
    '1A487757-9198-4346-85CE-8A5374E82FE9',
    'UQ_Graph_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '79f26920-ba29-401e-8c14-79fd348dad3f',
    '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D',
    'UQ_GraphConcept_GraphID_Name',
    'GraphID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '0fc53143-78c2-47e4-975a-703d5a2ef5f8',
    '361B37C8-08FD-4A66-8A83-AC5DC3CB28B9',
    'UQ_DocumentSequenceCounter_Key_Scope',
    'SequenceKey,ScopeKey',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '20425249-34bd-48fc-b230-1a0df603b46e',
    '4E40BD04-842D-4CAE-841D-D69DEC4B17E9',
    'UQ_GraphAuthorityTier_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '891014ae-7da6-473d-a394-1f92e91b66d8',
    '8ECBEA4B-2D6B-44E1-886C-96E904637866',
    'UQ_VideoArchetype_CompanyID_Name',
    'CompanyID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '6263a9dc-bce0-47d1-8565-748a583a82b3',
    '95AE4A10-7D58-4D55-BE27-5B934A958411',
    'UQ_DiagnosticSessionChunk_Session_Source_Host_Kind_Seq',
    'DiagnosticSessionID,Source,HostInstanceLabel,ContentKind,Sequence',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '4cfd420c-efe6-4d87-9c59-c3dbc4bb1316',
    '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D',
    'UQ_GraphEdgeType_Global_Name',
    'Name',
    '([GraphID] IS NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '65a58511-55bb-4c27-8c1d-fca2f771d32c',
    '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D',
    'UQ_GraphEdgeType_Scoped_Name',
    'GraphID,Name',
    '([GraphID] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '5321974f-fd4c-444e-9ee5-e1048e88c755',
    'C52B0468-A653-49AD-9FC6-097D7374E803',
    'UQ_GraphType_Name',
    'Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '8fa1d8ff-715c-4e03-8128-0a34e023566d',
    'C94C4F04-F747-49B8-9C57-AEB656A64592',
    'UQ_GraphEdgeProvider_Graph_Name',
    'GraphID,Name',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'd946841d-e986-4768-b631-2d0dc8d7dd69',
    'DB47217B-E302-43AA-BAF0-1B53A26DBC67',
    'UQ_GraphConceptType_Name',
    'Name',
    NULL
  );
/* Create Entity Relationship: MJ: Entities -> MJ: Entity Unique Keys (One To Many via EntityID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8df13fb5-a4ed-4248-9c35-42818dc05cd0') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8df13fb5-a4ed-4248-9c35-42818dc05cd0', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F', 'EntityID', 'One To Many', TRUE, TRUE, 90, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '094bd0a9-c9b6-4e59-90f7-b1e808075c68' OR ("EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND "Name" = 'Entity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('094bd0a9-c9b6-4e59-90f7-b1e808075c68', 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' /* Entity: MJ: Entity Unique Keys */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'), 'Entity', 'Entity', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Unique Keys
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_unique_key_entity_id"
    ON "__mj"."EntityUniqueKey" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Unique Keys
-- Item: vwEntityUniqueKeys
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Unique Keys
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityUniqueKey
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwEntityUniqueKeys"
AS
SELECT
    e.*,
    MJEntity_EntityID."Name" AS "Entity"
FROM
    "__mj"."EntityUniqueKey" AS e
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "e"."EntityID" = MJEntity_EntityID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwEntityUniqueKeys'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwEntityUniqueKeys'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwEntityUniqueKeys" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwEntityUniqueKeys" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwEntityUniqueKeys" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwEntityUniqueKeys" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Unique Keys
-- Item: spCreateEntityUniqueKey
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityUniqueKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityUniqueKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityUniqueKey"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_fieldnames TEXT DEFAULT NULL,
    p_filterdefinition_clear boolean DEFAULT false,
    p_filterdefinition TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityUniqueKeys" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityUniqueKey"
        (
            "ID",
            "EntityID",
                "Name",
                "FieldNames",
                "FilterDefinition"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_name,
                p_fieldnames,
                CASE WHEN p_filterdefinition_clear = true THEN NULL ELSE COALESCE(p_filterdefinition, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityUniqueKeys"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityUniqueKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityUniqueKey" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Unique Keys
-- Item: spUpdateEntityUniqueKey
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityUniqueKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityUniqueKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityUniqueKey"(
    p_id UUID,
    p_entityid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_fieldnames TEXT DEFAULT NULL,
    p_filterdefinition_clear boolean DEFAULT false,
    p_filterdefinition TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityUniqueKeys" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityUniqueKey"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "Name" = COALESCE(p_name, "Name"),
        "FieldNames" = COALESCE(p_fieldnames, "FieldNames"),
        "FilterDefinition" = CASE WHEN p_filterdefinition_clear = true THEN NULL ELSE COALESCE(p_filterdefinition, "FilterDefinition") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityUniqueKeys"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityUniqueKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityUniqueKey" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityUniqueKey table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_unique_key"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_unique_key" ON "__mj"."EntityUniqueKey";

CREATE TRIGGER "trg_update_entity_unique_key"
BEFORE UPDATE ON "__mj"."EntityUniqueKey"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_unique_key"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Unique Keys
-- Item: spDeleteEntityUniqueKey
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityUniqueKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityUniqueKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityUniqueKey"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."EntityUniqueKey"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityUniqueKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityUniqueKey" TO "cdp_Integration";
