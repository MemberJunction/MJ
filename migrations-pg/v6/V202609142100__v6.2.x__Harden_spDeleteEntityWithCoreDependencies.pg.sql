-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609142100__v6.2.x__Harden_spDeleteEntityWithCoreDependencies.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Hand-ported (the split converter emitted "no DDL to translate" for this CREATE OR ALTER
-- PROC — an emptied counterpart, caught by scripts/check-pg-migration-content.mjs).
--
-- Carries the SQL Server hardening (#3546, #4483) onto the PostgreSQL definition last set by
-- V202608061704. Signature and RETURNS SETOF record are unchanged (the v5.46 baseline contract;
-- CREATE OR REPLACE cannot change a return type).
--
--  1. SET XACT_ABORT ON has no PostgreSQL counterpart and needs none: an error anywhere in a
--     plpgsql function aborts the whole call and rolls back every statement it already ran, so
--     the "half-pruned entity" outcome the SQL Server comment describes cannot happen here —
--     including the second-order case SQL Server leaves as follow-up.
--  2. ResourceType.CategoryEntityID is nulled (ResourceType references Entity twice).
--  3. Precondition: every inbound FK into Entity this function does not clear, enforced on
--     delete (confdeltype NO ACTION 'a' / RESTRICT 'r' — CASCADE / SET NULL / SET DEFAULT do not
--     block, matching the SQL Server C-1 filter), is probed; any that still has rows raises
--     BEFORE the first delete, naming schema.table.column. Entity.ParentID stays unhandled on
--     purpose, exactly as in SQL Server.
--  4. UserView is deleted BEFORE UserViewCategory (UserView.CategoryID -> UserViewCategory.ID is
--     NO ACTION; the old order failed on any entity that was actually used).
-- ════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityWithCoreDependencies"(p_EntityID uuid)
RETURNS SETOF record
LANGUAGE plpgsql
AS $spdel$
DECLARE
    v_handled  text[] := ARRAY[
        'EntitySetting.EntityID', 'EntityField.EntityID', 'EntityField.RelatedEntityID',
        'EntityPermission.EntityID', 'EntityRelationship.EntityID', 'EntityRelationship.RelatedEntityID',
        'UserApplicationEntity.EntityID', 'ApplicationEntity.EntityID', 'RecordChange.EntityID',
        'AuditLog.EntityID', 'Conversation.LinkedEntityID', 'List.EntityID',
        'EntityDocument.EntityID', 'CompanyIntegrationRecordMap.EntityID', 'ResourceType.EntityID',
        'ResourceType.CategoryEntityID', 'DatasetItem.EntityID', 'UserViewCategory.EntityID',
        'UserView.EntityID', 'EntityAIAction.EntityID', 'EntityAIAction.OutputEntityID',
        'EntityCommunicationMessageType.EntityID'
    ];
    v_ref      record;
    v_found    boolean;
    v_blockers text[] := ARRAY[]::text[];
BEGIN
    -- ── Precondition: refuse to start if something we do not handle still points at this entity ──
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

    -- ── Cascade (unchanged from V202608061704 except where noted) ──
    DELETE FROM "__mj"."EntityFieldValue" WHERE "EntityFieldID" IN (SELECT "ID" FROM "__mj"."EntityField" WHERE "EntityID" = p_EntityID);
    DELETE FROM "__mj"."EntitySetting" WHERE "EntityID" = p_EntityID;
    DELETE FROM "__mj"."EntityField" WHERE "EntityID" = p_EntityID;
    DELETE FROM "__mj"."EntityPermission" WHERE "EntityID" = p_EntityID;
    DELETE FROM "__mj"."EntityRelationship" WHERE "EntityID" = p_EntityID OR "RelatedEntityID" = p_EntityID;
    DELETE FROM "__mj"."UserApplicationEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM "__mj"."ApplicationEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM "__mj"."RecordChange" WHERE "EntityID" = p_EntityID;
    DELETE FROM "__mj"."AuditLog" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."Conversation" WHERE "LinkedEntityID" = p_EntityID;
    DELETE FROM "__mj"."ListDetail" WHERE "ListID" IN (SELECT "ID" FROM "__mj"."List" WHERE "EntityID" = p_EntityID);
    DELETE FROM "__mj"."List" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityDocument" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."CompanyIntegrationRecordMap" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."ResourceType" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."UserApplicationEntity" WHERE "EntityID" = p_EntityID;

    UPDATE "__mj"."Dataset" SET "__mj_UpdatedAt" = NOW() WHERE "ID" IN (SELECT "DatasetID" FROM "__mj"."DatasetItem" WHERE "EntityID" = p_EntityID);
    DELETE FROM __mj."DatasetItem" WHERE "EntityID" = p_EntityID;

    -- ORDER MATTERS (change 4): children before parents.
    DELETE FROM __mj."UserView" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."UserViewCategory" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."EntityAIAction" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityCommunicationMessageType" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityAIAction" WHERE "OutputEntityID" = p_EntityID;

    -- Clear inbound metadata references from OTHER entities' fields that point AT this entity (#3561).
    UPDATE "__mj"."EntityField" SET "RelatedEntityID" = NULL WHERE "RelatedEntityID" = p_EntityID;

    -- ResourceType references Entity twice; the delete above clears EntityID, this clears the
    -- other one (change 2, #4483).
    UPDATE __mj."ResourceType" SET "CategoryEntityID" = NULL WHERE "CategoryEntityID" = p_EntityID;

    DELETE FROM "__mj"."Entity" WHERE "ID" = p_EntityID;
END
$spdel$;

GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityWithCoreDependencies"(uuid) TO "cdp_Developer", "cdp_Integration";
