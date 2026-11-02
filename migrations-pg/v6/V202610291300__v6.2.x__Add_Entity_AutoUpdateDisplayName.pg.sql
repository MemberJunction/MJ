-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610291300__v6.2.x__Add_Entity_AutoUpdateDisplayName.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."Entity"
ADD COLUMN "AutoUpdateDisplayName" BOOLEAN NOT NULL DEFAULT TRUE /* ============================================================================= */ /* Entity.AutoUpdateDisplayName — a per-entity lock on the display name, so */ /* CodeGen can improve `Entity.DisplayName` without ever overwriting a human. */ /* ============================================================================= */ /* THE ASYMMETRY THIS CLOSES. `EntityField` has carried `AutoUpdateDisplayName` */ /* since v2.122, and CodeGen uses it: the LLM-generated field display names from */ /* the FormLayout feature are written only where that flag is 1, so a display */ /* name an administrator typed is never clobbered by a later run. */ /* `Entity` has no such flag. It carries AutoUpdateDescription, */ /* AutoUpdateFullTextSearch, AutoUpdateAllowUserSearchAPI and */ /* AutoUpdateSupportsGeoCoding — but nothing governing DisplayName. That is not */ /* an oversight so much as a consequence: nothing ever auto-updated an entity's */ /* display name, so there was nothing to lock. `Entity.DisplayName` is set once, */ /* at entity creation, by stripping the schema's configured prefix/suffix off the */ /* entity name, and is never revisited. */ /* Adding the flag is therefore a precondition for the feature that uses it, not */ /* a change in its own right: without it, an LLM display-name pass would have no */ /* way to distinguish "this is the mechanical default" from "an administrator */ /* chose this", and would have to either skip every entity that already has a */ /* DisplayName (making it useless on exactly the legacy schemas it exists to fix) */ /* or overwrite deliberate human choices. */ /* DEFAULT 1, MATCHING EntityField. Existing rows opt in. That is safe because */ /* the flag alone changes nothing: the display-name generation it gates is a */ /* separate advanced-generation feature that ships DISABLED, and an administrator */ /* who never enables it will never see a display name change. Defaulting to 0 */ /* instead would mean every existing entity is locked at rollout, so enabling the */ /* feature later would silently do nothing until each row was flipped by hand — */ /* the flag would read as broken rather than off. */ /* Administrators who want a specific entity's display name frozen set it to 0, */ /* exactly as they already do for a field. */ /* ============================================================================= */;

COMMENT ON COLUMN __mj."Entity"."AutoUpdateDisplayName" IS 'When 1 (the default), CodeGen may auto-update this entity''s DisplayName — currently via the optional EntityDisplayNames advanced-generation feature, which asks an LLM to expand opaque table-derived names (ACCT_STAT_CD) into readable ones (Account Status Codes). When 0, the DisplayName is locked and CodeGen will not change it, whatever any generator proposes. Mirrors EntityField.AutoUpdateDisplayName. Note this flag governs only AUTOMATIC updates: a user editing the DisplayName directly is unaffected either way.';

-- ╔══ HAND-FINISHED FOR POSTGRESQL: app-owned vwEntities ══╗
-- MJ: Entities owns its base view (BaseViewGenerated = 0), so CodeGen never rewrites vwEntities.
-- On SQL Server the view selects e.* and the migration refreshes it; on PostgreSQL its column list is
-- explicit and was fixed at CREATE, so the new column never reaches the view and
-- spDeleteUnneededEntityFields deletes its EntityField row (the DEPLOYMENT.md "App-owned base views"
-- case; vwUsers in v6.2.0-edge.4 and vwUserViews in edge.6 were fixed the same way).
-- CREATE OR REPLACE may only append columns, so AutoUpdateDisplayName goes last. The columns already
-- missing from this view before this release are tracked in MemberJunction/MJ#5649.
-- ╚══════════════════════════════════════════════════════╝
CREATE OR REPLACE VIEW __mj."vwEntities" AS
 SELECT e."ID",
    e."ParentID",
    e."Name",
    e."NameSuffix",
    e."Description",
    e."AutoUpdateDescription",
    e."BaseTable",
    e."BaseView",
    e."BaseViewGenerated",
    e."SchemaName",
    e."VirtualEntity",
    e."TrackRecordChanges",
    e."AuditRecordAccess",
    e."AuditViewRuns",
    e."IncludeInAPI",
    e."AllowAllRowsAPI",
    e."AllowUpdateAPI",
    e."AllowCreateAPI",
    e."AllowDeleteAPI",
    e."CustomResolverAPI",
    e."AllowUserSearchAPI",
    e."FullTextSearchEnabled",
    e."FullTextCatalog",
    e."FullTextCatalogGenerated",
    e."FullTextIndex",
    e."FullTextIndexGenerated",
    e."FullTextSearchFunction",
    e."FullTextSearchFunctionGenerated",
    e."UserViewMaxRows",
    e."spCreate",
    e."spUpdate",
    e."spDelete",
    e."spCreateGenerated",
    e."spUpdateGenerated",
    e."spDeleteGenerated",
    e."CascadeDeletes",
    e."DeleteType",
    e."AllowRecordMerge",
    e."spMatch",
    e."RelationshipDefaultDisplayType",
    e."UserFormGenerated",
    e."EntityObjectSubclassName",
    e."EntityObjectSubclassImport",
    e."PreferredCommunicationField",
    e."Icon",
    e."__mj_CreatedAt",
    e."__mj_UpdatedAt",
    e."ScopeDefault",
    e."RowsToPackWithSchema",
    e."RowsToPackSampleMethod",
    e."RowsToPackSampleCount",
    e."RowsToPackSampleOrder",
    e."AutoRowCountFrequency",
    e."RowCount",
    e."RowCountRunAt",
    e."Status",
    e."DisplayName",
    e."AllowMultipleSubtypes",
    e."AutoUpdateFullTextSearch",
    e."AutoUpdateAllowUserSearchAPI",
    e."TrustServerCacheCompletely",
    e."SupportsGeoCoding",
    e."AutoUpdateSupportsGeoCoding",
    e."AllowCaching",
    e."DetectExternalChanges",
    __mj."GetProgrammaticName"(__mj."GetClassNameSchemaPrefix"(COALESCE(si."CanonicalSchemaName", e."SchemaName"))::text || replace(
        CASE
            WHEN si."EntityNamePrefix" IS NOT NULL THEN replace(e."Name"::text, si."EntityNamePrefix"::text, ''::text)::character varying
            ELSE e."Name"
        END::text, ' '::text, ''::text)) AS "CodeName",
    __mj."GetProgrammaticName"((__mj."GetClassNameSchemaPrefix"(COALESCE(si."CanonicalSchemaName", e."SchemaName"))::text || e."BaseTable"::text) || COALESCE(e."NameSuffix", ''::character varying)::text) AS "ClassName",
    __mj."GetProgrammaticName"(e."BaseTable"::text || COALESCE(e."NameSuffix", ''::character varying)::text) AS "BaseTableCodeName",
    par."Name" AS "ParentEntity",
    par."BaseTable" AS "ParentBaseTable",
    par."BaseView" AS "ParentBaseView",
    si."CanonicalSchemaName",
    e."ExternalDataSourceID",
    e."ExternalObjectName",
    e."GeneratedBaseViewName",
    e."AllowDirectSQLInsert",
    e."AllowDirectSQLUpdate",
    e."AllowDirectSQLDelete",
    e."Configuration",
    e."SubtypeSelector",
    e."AutoUpdateDisplayName"
   FROM __mj."Entity" e
     LEFT JOIN __mj."Entity" par ON e."ParentID" = par."ID"
     LEFT JOIN __mj."SchemaInfo" si ON e."SchemaName"::text = si."SchemaName"::text;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '97ff6d48-f4b9-4bf8-925b-ff2d140e1d49' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AutoUpdateDisplayName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('97ff6d48-f4b9-4bf8-925b-ff2d140e1d49', 'E0238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entities */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6'), 'AutoUpdateDisplayName', 'Auto Update Display Name', 'When 1 (the default), CodeGen may auto-update this entity''s DisplayName — currently via the optional EntityDisplayNames advanced-generation feature, which asks an LLM to expand opaque table-derived names (ACCT_STAT_CD) into readable ones (Account Status Codes). When 0, the DisplayName is locked and CodeGen will not change it, whatever any generator proposes. Mirrors EntityField.AutoUpdateDisplayName. Note this flag governs only AUTOMATIC updates: a user editing the DisplayName directly is unaffected either way.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- Flush any pending deferred trigger events from prior DML so the index DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'Entity' AND indexname = 'IDX_AUTO_MJ_FKEY_Entity_ParentID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_Entity_ParentID" ON __mj."Entity"("ParentID");
  END IF;
END $$;

-- Flush any pending deferred trigger events from prior DML so the index DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'Entity' AND indexname = 'IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID" ON __mj."Entity"("ExternalDataSourceID");
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_parent_id"
    ON "__mj"."Entity" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: Permissions for vwEntities
-- ============================================================
GRANT SELECT ON "__mj"."vwEntities" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwEntities" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwEntities" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spCreateEntity
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Entity (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntity"(p_data JSONB)
RETURNS SETOF "__mj"."vwEntities"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['ParentID', 'Name', 'NameSuffix', 'Description', 'AutoUpdateDescription', 'BaseView', 'BaseViewGenerated', 'VirtualEntity', 'TrackRecordChanges', 'AuditRecordAccess', 'AuditViewRuns', 'IncludeInAPI', 'AllowAllRowsAPI', 'AllowUpdateAPI', 'AllowCreateAPI', 'AllowDeleteAPI', 'CustomResolverAPI', 'AllowUserSearchAPI', 'FullTextSearchEnabled', 'FullTextCatalog', 'FullTextCatalogGenerated', 'FullTextIndex', 'FullTextIndexGenerated', 'FullTextSearchFunction', 'FullTextSearchFunctionGenerated', 'UserViewMaxRows', 'spCreate', 'spUpdate', 'spDelete', 'spCreateGenerated', 'spUpdateGenerated', 'spDeleteGenerated', 'CascadeDeletes', 'DeleteType', 'AllowRecordMerge', 'spMatch', 'RelationshipDefaultDisplayType', 'UserFormGenerated', 'EntityObjectSubclassName', 'EntityObjectSubclassImport', 'PreferredCommunicationField', 'Icon', 'ScopeDefault', 'RowsToPackWithSchema', 'RowsToPackSampleMethod', 'RowsToPackSampleCount', 'RowsToPackSampleOrder', 'AutoRowCountFrequency', 'RowCount', 'RowCountRunAt', 'Status', 'DisplayName', 'AllowMultipleSubtypes', 'AutoUpdateFullTextSearch', 'AutoUpdateAllowUserSearchAPI', 'TrustServerCacheCompletely', 'SupportsGeoCoding', 'AutoUpdateSupportsGeoCoding', 'AllowCaching', 'DetectExternalChanges', 'GeneratedBaseViewName', 'AllowDirectSQLInsert', 'AllowDirectSQLUpdate', 'AllowDirectSQLDelete', 'Configuration', 'SubtypeSelector']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'Name' THEN '($1->>''Name'')'
        WHEN 'NameSuffix' THEN '($1->>''NameSuffix'')'
        WHEN 'Description' THEN '($1->>''Description'')'
        WHEN 'AutoUpdateDescription' THEN 'COALESCE(($1->>''AutoUpdateDescription'')::BOOLEAN, TRUE)'
        WHEN 'BaseView' THEN '($1->>''BaseView'')'
        WHEN 'BaseViewGenerated' THEN 'COALESCE(($1->>''BaseViewGenerated'')::BOOLEAN, TRUE)'
        WHEN 'VirtualEntity' THEN 'COALESCE(($1->>''VirtualEntity'')::BOOLEAN, FALSE)'
        WHEN 'TrackRecordChanges' THEN 'COALESCE(($1->>''TrackRecordChanges'')::BOOLEAN, TRUE)'
        WHEN 'AuditRecordAccess' THEN 'COALESCE(($1->>''AuditRecordAccess'')::BOOLEAN, TRUE)'
        WHEN 'AuditViewRuns' THEN 'COALESCE(($1->>''AuditViewRuns'')::BOOLEAN, TRUE)'
        WHEN 'IncludeInAPI' THEN 'COALESCE(($1->>''IncludeInAPI'')::BOOLEAN, FALSE)'
        WHEN 'AllowAllRowsAPI' THEN 'COALESCE(($1->>''AllowAllRowsAPI'')::BOOLEAN, FALSE)'
        WHEN 'AllowUpdateAPI' THEN 'COALESCE(($1->>''AllowUpdateAPI'')::BOOLEAN, FALSE)'
        WHEN 'AllowCreateAPI' THEN 'COALESCE(($1->>''AllowCreateAPI'')::BOOLEAN, FALSE)'
        WHEN 'AllowDeleteAPI' THEN 'COALESCE(($1->>''AllowDeleteAPI'')::BOOLEAN, FALSE)'
        WHEN 'CustomResolverAPI' THEN 'COALESCE(($1->>''CustomResolverAPI'')::BOOLEAN, FALSE)'
        WHEN 'AllowUserSearchAPI' THEN 'COALESCE(($1->>''AllowUserSearchAPI'')::BOOLEAN, FALSE)'
        WHEN 'FullTextSearchEnabled' THEN 'COALESCE(($1->>''FullTextSearchEnabled'')::BOOLEAN, FALSE)'
        WHEN 'FullTextCatalog' THEN '($1->>''FullTextCatalog'')'
        WHEN 'FullTextCatalogGenerated' THEN 'COALESCE(($1->>''FullTextCatalogGenerated'')::BOOLEAN, TRUE)'
        WHEN 'FullTextIndex' THEN '($1->>''FullTextIndex'')'
        WHEN 'FullTextIndexGenerated' THEN 'COALESCE(($1->>''FullTextIndexGenerated'')::BOOLEAN, TRUE)'
        WHEN 'FullTextSearchFunction' THEN '($1->>''FullTextSearchFunction'')'
        WHEN 'FullTextSearchFunctionGenerated' THEN 'COALESCE(($1->>''FullTextSearchFunctionGenerated'')::BOOLEAN, TRUE)'
        WHEN 'UserViewMaxRows' THEN '($1->>''UserViewMaxRows'')::INT'
        WHEN 'spCreate' THEN '($1->>''spCreate'')'
        WHEN 'spUpdate' THEN '($1->>''spUpdate'')'
        WHEN 'spDelete' THEN '($1->>''spDelete'')'
        WHEN 'spCreateGenerated' THEN 'COALESCE(($1->>''spCreateGenerated'')::BOOLEAN, TRUE)'
        WHEN 'spUpdateGenerated' THEN 'COALESCE(($1->>''spUpdateGenerated'')::BOOLEAN, TRUE)'
        WHEN 'spDeleteGenerated' THEN 'COALESCE(($1->>''spDeleteGenerated'')::BOOLEAN, TRUE)'
        WHEN 'CascadeDeletes' THEN 'COALESCE(($1->>''CascadeDeletes'')::BOOLEAN, FALSE)'
        WHEN 'DeleteType' THEN 'COALESCE(($1->>''DeleteType''), ''Hard'')'
        WHEN 'AllowRecordMerge' THEN 'COALESCE(($1->>''AllowRecordMerge'')::BOOLEAN, FALSE)'
        WHEN 'spMatch' THEN '($1->>''spMatch'')'
        WHEN 'RelationshipDefaultDisplayType' THEN 'COALESCE(($1->>''RelationshipDefaultDisplayType''), ''Search'')'
        WHEN 'UserFormGenerated' THEN 'COALESCE(($1->>''UserFormGenerated'')::BOOLEAN, TRUE)'
        WHEN 'EntityObjectSubclassName' THEN '($1->>''EntityObjectSubclassName'')'
        WHEN 'EntityObjectSubclassImport' THEN '($1->>''EntityObjectSubclassImport'')'
        WHEN 'PreferredCommunicationField' THEN '($1->>''PreferredCommunicationField'')'
        WHEN 'Icon' THEN '($1->>''Icon'')'
        WHEN 'ScopeDefault' THEN '($1->>''ScopeDefault'')'
        WHEN 'RowsToPackWithSchema' THEN 'COALESCE(($1->>''RowsToPackWithSchema''), ''None'')'
        WHEN 'RowsToPackSampleMethod' THEN 'COALESCE(($1->>''RowsToPackSampleMethod''), ''random'')'
        WHEN 'RowsToPackSampleCount' THEN 'COALESCE(($1->>''RowsToPackSampleCount'')::INT, 0)'
        WHEN 'RowsToPackSampleOrder' THEN '($1->>''RowsToPackSampleOrder'')'
        WHEN 'AutoRowCountFrequency' THEN '($1->>''AutoRowCountFrequency'')::INT'
        WHEN 'RowCount' THEN '($1->>''RowCount'')::BIGINT'
        WHEN 'RowCountRunAt' THEN '($1->>''RowCountRunAt'')::TIMESTAMPTZ'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Active'')'
        WHEN 'DisplayName' THEN '($1->>''DisplayName'')'
        WHEN 'AllowMultipleSubtypes' THEN 'COALESCE(($1->>''AllowMultipleSubtypes'')::BOOLEAN, FALSE)'
        WHEN 'AutoUpdateFullTextSearch' THEN 'COALESCE(($1->>''AutoUpdateFullTextSearch'')::BOOLEAN, TRUE)'
        WHEN 'AutoUpdateAllowUserSearchAPI' THEN 'COALESCE(($1->>''AutoUpdateAllowUserSearchAPI'')::BOOLEAN, TRUE)'
        WHEN 'TrustServerCacheCompletely' THEN 'COALESCE(($1->>''TrustServerCacheCompletely'')::BOOLEAN, TRUE)'
        WHEN 'SupportsGeoCoding' THEN 'COALESCE(($1->>''SupportsGeoCoding'')::BOOLEAN, FALSE)'
        WHEN 'AutoUpdateSupportsGeoCoding' THEN 'COALESCE(($1->>''AutoUpdateSupportsGeoCoding'')::BOOLEAN, TRUE)'
        WHEN 'AllowCaching' THEN 'COALESCE(($1->>''AllowCaching'')::BOOLEAN, FALSE)'
        WHEN 'DetectExternalChanges' THEN 'COALESCE(($1->>''DetectExternalChanges'')::BOOLEAN, FALSE)'
        WHEN 'GeneratedBaseViewName' THEN '($1->>''GeneratedBaseViewName'')'
        WHEN 'AllowDirectSQLInsert' THEN 'COALESCE(($1->>''AllowDirectSQLInsert'')::BOOLEAN, FALSE)'
        WHEN 'AllowDirectSQLUpdate' THEN 'COALESCE(($1->>''AllowDirectSQLUpdate'')::BOOLEAN, FALSE)'
        WHEN 'AllowDirectSQLDelete' THEN 'COALESCE(($1->>''AllowDirectSQLDelete'')::BOOLEAN, FALSE)'
        WHEN 'Configuration' THEN '($1->>''Configuration'')'
        WHEN 'SubtypeSelector' THEN '($1->>''SubtypeSelector'')'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."Entity" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntities"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntity" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spUpdateEntity
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Entity (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntity"(p_data JSONB)
RETURNS SETOF "__mj"."vwEntities"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateEntity: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."Entity"
    SET
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "Name" = CASE WHEN p_data ? 'Name' THEN (p_data->>'Name') ELSE "Name" END,
        "NameSuffix" = CASE WHEN p_data ? 'NameSuffix' THEN (p_data->>'NameSuffix') ELSE "NameSuffix" END,
        "Description" = CASE WHEN p_data ? 'Description' THEN (p_data->>'Description') ELSE "Description" END,
        "AutoUpdateDescription" = CASE WHEN p_data ? 'AutoUpdateDescription' THEN (p_data->>'AutoUpdateDescription')::BOOLEAN ELSE "AutoUpdateDescription" END,
        "BaseView" = CASE WHEN p_data ? 'BaseView' THEN (p_data->>'BaseView') ELSE "BaseView" END,
        "BaseViewGenerated" = CASE WHEN p_data ? 'BaseViewGenerated' THEN (p_data->>'BaseViewGenerated')::BOOLEAN ELSE "BaseViewGenerated" END,
        "VirtualEntity" = CASE WHEN p_data ? 'VirtualEntity' THEN (p_data->>'VirtualEntity')::BOOLEAN ELSE "VirtualEntity" END,
        "TrackRecordChanges" = CASE WHEN p_data ? 'TrackRecordChanges' THEN (p_data->>'TrackRecordChanges')::BOOLEAN ELSE "TrackRecordChanges" END,
        "AuditRecordAccess" = CASE WHEN p_data ? 'AuditRecordAccess' THEN (p_data->>'AuditRecordAccess')::BOOLEAN ELSE "AuditRecordAccess" END,
        "AuditViewRuns" = CASE WHEN p_data ? 'AuditViewRuns' THEN (p_data->>'AuditViewRuns')::BOOLEAN ELSE "AuditViewRuns" END,
        "IncludeInAPI" = CASE WHEN p_data ? 'IncludeInAPI' THEN (p_data->>'IncludeInAPI')::BOOLEAN ELSE "IncludeInAPI" END,
        "AllowAllRowsAPI" = CASE WHEN p_data ? 'AllowAllRowsAPI' THEN (p_data->>'AllowAllRowsAPI')::BOOLEAN ELSE "AllowAllRowsAPI" END,
        "AllowUpdateAPI" = CASE WHEN p_data ? 'AllowUpdateAPI' THEN (p_data->>'AllowUpdateAPI')::BOOLEAN ELSE "AllowUpdateAPI" END,
        "AllowCreateAPI" = CASE WHEN p_data ? 'AllowCreateAPI' THEN (p_data->>'AllowCreateAPI')::BOOLEAN ELSE "AllowCreateAPI" END,
        "AllowDeleteAPI" = CASE WHEN p_data ? 'AllowDeleteAPI' THEN (p_data->>'AllowDeleteAPI')::BOOLEAN ELSE "AllowDeleteAPI" END,
        "CustomResolverAPI" = CASE WHEN p_data ? 'CustomResolverAPI' THEN (p_data->>'CustomResolverAPI')::BOOLEAN ELSE "CustomResolverAPI" END,
        "AllowUserSearchAPI" = CASE WHEN p_data ? 'AllowUserSearchAPI' THEN (p_data->>'AllowUserSearchAPI')::BOOLEAN ELSE "AllowUserSearchAPI" END,
        "FullTextSearchEnabled" = CASE WHEN p_data ? 'FullTextSearchEnabled' THEN (p_data->>'FullTextSearchEnabled')::BOOLEAN ELSE "FullTextSearchEnabled" END,
        "FullTextCatalog" = CASE WHEN p_data ? 'FullTextCatalog' THEN (p_data->>'FullTextCatalog') ELSE "FullTextCatalog" END,
        "FullTextCatalogGenerated" = CASE WHEN p_data ? 'FullTextCatalogGenerated' THEN (p_data->>'FullTextCatalogGenerated')::BOOLEAN ELSE "FullTextCatalogGenerated" END,
        "FullTextIndex" = CASE WHEN p_data ? 'FullTextIndex' THEN (p_data->>'FullTextIndex') ELSE "FullTextIndex" END,
        "FullTextIndexGenerated" = CASE WHEN p_data ? 'FullTextIndexGenerated' THEN (p_data->>'FullTextIndexGenerated')::BOOLEAN ELSE "FullTextIndexGenerated" END,
        "FullTextSearchFunction" = CASE WHEN p_data ? 'FullTextSearchFunction' THEN (p_data->>'FullTextSearchFunction') ELSE "FullTextSearchFunction" END,
        "FullTextSearchFunctionGenerated" = CASE WHEN p_data ? 'FullTextSearchFunctionGenerated' THEN (p_data->>'FullTextSearchFunctionGenerated')::BOOLEAN ELSE "FullTextSearchFunctionGenerated" END,
        "UserViewMaxRows" = CASE WHEN p_data ? 'UserViewMaxRows' THEN (p_data->>'UserViewMaxRows')::INT ELSE "UserViewMaxRows" END,
        "spCreate" = CASE WHEN p_data ? 'spCreate' THEN (p_data->>'spCreate') ELSE "spCreate" END,
        "spUpdate" = CASE WHEN p_data ? 'spUpdate' THEN (p_data->>'spUpdate') ELSE "spUpdate" END,
        "spDelete" = CASE WHEN p_data ? 'spDelete' THEN (p_data->>'spDelete') ELSE "spDelete" END,
        "spCreateGenerated" = CASE WHEN p_data ? 'spCreateGenerated' THEN (p_data->>'spCreateGenerated')::BOOLEAN ELSE "spCreateGenerated" END,
        "spUpdateGenerated" = CASE WHEN p_data ? 'spUpdateGenerated' THEN (p_data->>'spUpdateGenerated')::BOOLEAN ELSE "spUpdateGenerated" END,
        "spDeleteGenerated" = CASE WHEN p_data ? 'spDeleteGenerated' THEN (p_data->>'spDeleteGenerated')::BOOLEAN ELSE "spDeleteGenerated" END,
        "CascadeDeletes" = CASE WHEN p_data ? 'CascadeDeletes' THEN (p_data->>'CascadeDeletes')::BOOLEAN ELSE "CascadeDeletes" END,
        "DeleteType" = CASE WHEN p_data ? 'DeleteType' THEN (p_data->>'DeleteType') ELSE "DeleteType" END,
        "AllowRecordMerge" = CASE WHEN p_data ? 'AllowRecordMerge' THEN (p_data->>'AllowRecordMerge')::BOOLEAN ELSE "AllowRecordMerge" END,
        "spMatch" = CASE WHEN p_data ? 'spMatch' THEN (p_data->>'spMatch') ELSE "spMatch" END,
        "RelationshipDefaultDisplayType" = CASE WHEN p_data ? 'RelationshipDefaultDisplayType' THEN (p_data->>'RelationshipDefaultDisplayType') ELSE "RelationshipDefaultDisplayType" END,
        "UserFormGenerated" = CASE WHEN p_data ? 'UserFormGenerated' THEN (p_data->>'UserFormGenerated')::BOOLEAN ELSE "UserFormGenerated" END,
        "EntityObjectSubclassName" = CASE WHEN p_data ? 'EntityObjectSubclassName' THEN (p_data->>'EntityObjectSubclassName') ELSE "EntityObjectSubclassName" END,
        "EntityObjectSubclassImport" = CASE WHEN p_data ? 'EntityObjectSubclassImport' THEN (p_data->>'EntityObjectSubclassImport') ELSE "EntityObjectSubclassImport" END,
        "PreferredCommunicationField" = CASE WHEN p_data ? 'PreferredCommunicationField' THEN (p_data->>'PreferredCommunicationField') ELSE "PreferredCommunicationField" END,
        "Icon" = CASE WHEN p_data ? 'Icon' THEN (p_data->>'Icon') ELSE "Icon" END,
        "ScopeDefault" = CASE WHEN p_data ? 'ScopeDefault' THEN (p_data->>'ScopeDefault') ELSE "ScopeDefault" END,
        "RowsToPackWithSchema" = CASE WHEN p_data ? 'RowsToPackWithSchema' THEN (p_data->>'RowsToPackWithSchema') ELSE "RowsToPackWithSchema" END,
        "RowsToPackSampleMethod" = CASE WHEN p_data ? 'RowsToPackSampleMethod' THEN (p_data->>'RowsToPackSampleMethod') ELSE "RowsToPackSampleMethod" END,
        "RowsToPackSampleCount" = CASE WHEN p_data ? 'RowsToPackSampleCount' THEN (p_data->>'RowsToPackSampleCount')::INT ELSE "RowsToPackSampleCount" END,
        "RowsToPackSampleOrder" = CASE WHEN p_data ? 'RowsToPackSampleOrder' THEN (p_data->>'RowsToPackSampleOrder') ELSE "RowsToPackSampleOrder" END,
        "AutoRowCountFrequency" = CASE WHEN p_data ? 'AutoRowCountFrequency' THEN (p_data->>'AutoRowCountFrequency')::INT ELSE "AutoRowCountFrequency" END,
        "RowCount" = CASE WHEN p_data ? 'RowCount' THEN (p_data->>'RowCount')::BIGINT ELSE "RowCount" END,
        "RowCountRunAt" = CASE WHEN p_data ? 'RowCountRunAt' THEN (p_data->>'RowCountRunAt')::TIMESTAMPTZ ELSE "RowCountRunAt" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "DisplayName" = CASE WHEN p_data ? 'DisplayName' THEN (p_data->>'DisplayName') ELSE "DisplayName" END,
        "AllowMultipleSubtypes" = CASE WHEN p_data ? 'AllowMultipleSubtypes' THEN (p_data->>'AllowMultipleSubtypes')::BOOLEAN ELSE "AllowMultipleSubtypes" END,
        "AutoUpdateFullTextSearch" = CASE WHEN p_data ? 'AutoUpdateFullTextSearch' THEN (p_data->>'AutoUpdateFullTextSearch')::BOOLEAN ELSE "AutoUpdateFullTextSearch" END,
        "AutoUpdateAllowUserSearchAPI" = CASE WHEN p_data ? 'AutoUpdateAllowUserSearchAPI' THEN (p_data->>'AutoUpdateAllowUserSearchAPI')::BOOLEAN ELSE "AutoUpdateAllowUserSearchAPI" END,
        "TrustServerCacheCompletely" = CASE WHEN p_data ? 'TrustServerCacheCompletely' THEN (p_data->>'TrustServerCacheCompletely')::BOOLEAN ELSE "TrustServerCacheCompletely" END,
        "SupportsGeoCoding" = CASE WHEN p_data ? 'SupportsGeoCoding' THEN (p_data->>'SupportsGeoCoding')::BOOLEAN ELSE "SupportsGeoCoding" END,
        "AutoUpdateSupportsGeoCoding" = CASE WHEN p_data ? 'AutoUpdateSupportsGeoCoding' THEN (p_data->>'AutoUpdateSupportsGeoCoding')::BOOLEAN ELSE "AutoUpdateSupportsGeoCoding" END,
        "AllowCaching" = CASE WHEN p_data ? 'AllowCaching' THEN (p_data->>'AllowCaching')::BOOLEAN ELSE "AllowCaching" END,
        "DetectExternalChanges" = CASE WHEN p_data ? 'DetectExternalChanges' THEN (p_data->>'DetectExternalChanges')::BOOLEAN ELSE "DetectExternalChanges" END,
        "GeneratedBaseViewName" = CASE WHEN p_data ? 'GeneratedBaseViewName' THEN (p_data->>'GeneratedBaseViewName') ELSE "GeneratedBaseViewName" END,
        "AllowDirectSQLInsert" = CASE WHEN p_data ? 'AllowDirectSQLInsert' THEN (p_data->>'AllowDirectSQLInsert')::BOOLEAN ELSE "AllowDirectSQLInsert" END,
        "AllowDirectSQLUpdate" = CASE WHEN p_data ? 'AllowDirectSQLUpdate' THEN (p_data->>'AllowDirectSQLUpdate')::BOOLEAN ELSE "AllowDirectSQLUpdate" END,
        "AllowDirectSQLDelete" = CASE WHEN p_data ? 'AllowDirectSQLDelete' THEN (p_data->>'AllowDirectSQLDelete')::BOOLEAN ELSE "AllowDirectSQLDelete" END,
        "Configuration" = CASE WHEN p_data ? 'Configuration' THEN (p_data->>'Configuration') ELSE "Configuration" END,
        "SubtypeSelector" = CASE WHEN p_data ? 'SubtypeSelector' THEN (p_data->>'SubtypeSelector') ELSE "SubtypeSelector" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntities"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntity" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity" ON "__mj"."Entity";

CREATE TRIGGER "trg_update_entity"
BEFORE UPDATE ON "__mj"."Entity"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spDeleteEntity
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Entity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntity"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."Entity"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntity" TO "cdp_Integration";
