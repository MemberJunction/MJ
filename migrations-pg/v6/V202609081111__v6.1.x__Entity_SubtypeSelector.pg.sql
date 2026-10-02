-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609081111__v6.1.x__Entity_SubtypeSelector.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."Entity"
ADD COLUMN "SubtypeSelector" TEXT NULL /* ============================================================================= */ /* Entity.SubtypeSelector — declarative prospective IsA subtype resolution */ /* ============================================================================= */ /* WHAT THIS ENABLES. MemberJunction models IsA relationships (table-per-type */ /* inheritance with shared primary keys). For existing records, FindISAChildEntity */ /* probes the database via a UNION ALL query across Entity.ChildEntities to discover */ /* which subtype row exists. For new records, there is no database row yet, so */ /* the runtime needs a prospective answer to "which subtype should this record have?" */ /* This column provides a declarative, metadata-driven rule for prospective subtype */ /* resolution. For example, on 'Order Lines', SubtypeSelector can be configured as: */ /*     { "Path": "ProductID.ProductTypeID.OrderLineExtensionEntity" } */ /* This traverses the foreign-key chain from OrderLine -> Product -> ProductType, */ /* reading the target extension entity name from ProductType.OrderLineExtensionEntity. */ /* WHY A JSONType RATHER THAN COLUMNS. The configuration shape */ /* (IEntitySubtypeSelectorConfig) encapsulates the resolution strategy (e.g. Path-based */ /* foreign key traversal) in a flexible, schema-agnostic format. */ /* ADDITIVE ON PURPOSE. NULL on every existing row means "no declarative subtype */ /* selector configured", maintaining existing behavior. */ /* WHO READS IT. */ /* 1. BaseEntity.ResolveSubtypeEntityName() in @memberjunction/core uses this */ /*    as a declarative rule when no runtime EntitySubtypeResolver is registered. */ /* 2. Offline tools like Loom (the data generator) and CodeGen, which do not run */ /*    the full MJ runtime, inspect this metadata to determine when conditional */ /*    subtypes should be emitted. */ /* SEE ALSO. plans/sync-composition-axes.md */ /* ============================================================================= */;

COMMENT ON COLUMN __mj."Entity"."SubtypeSelector" IS 'Optional JSON configuration specifying the declarative subtype selector for this entity (shape = IEntitySubtypeSelectorConfig). Path is a dotted foreign-key dereference path ending at a column containing the target subtype entity name (e.g. "ProductID.ProductTypeID.OrderLineExtensionEntity"). Read by BaseEntity.ResolveSubtypeEntityName() as a fallback when no runtime EntitySubtypeResolver is registered, and by offline tooling like Loom and CodeGen to determine conditional IsA child entities. NULL means no declarative subtype selector is configured.';

-- ============================================================================
-- HAND-ADDED — recreate the app-owned base view so the new column reaches the
-- read path. This is the PostgreSQL counterpart of the SQL Server migration's
--     EXEC sp_refreshview '__mj.vwEntities';        (source line 970)
-- whose own comment says: "sp_refreshview on vwEntities so the new column
-- reaches the read path."
--
-- WHY IT IS NEEDED, AND WHY THE CONVERTER COULD NOT DO IT
-- ------------------------------------------------------
-- "MJ: Entities" has BaseViewGenerated = FALSE — it is an APP-OWNED base view,
-- so CodeGen never rewrites it and --bake-codegen has nothing to bake for it.
-- SQL Server keeps such a view current with sp_refreshview. PostgreSQL has no
-- equivalent: it expands and FREEZES a view's column list at CREATE time. So
-- without this statement Entity.SubtypeSelector lands as a table column that
-- vwEntities never exposes.
--
-- That is not a cosmetic gap. A metadata field with no matching base-view column
-- is what spDeleteUnneededEntityFields treats as "unneeded", so the EntityField
-- row this migration inserts gets deleted again, and `mj sync push` then fails on
--     Lookup failed: No record found in 'MJ: Entity Fields' … Name='SubtypeSelector'
-- which is exactly how this was caught: the fresh-database `mj migrate` gate
-- passed clean, and the failure only surfaced in the sync-push half of the gate.
--
-- The new column is APPENDED AT THE END of the select list, following the
-- precedent set by V202604131300__v5.26.x__Add_AllowCaching_And_DetectExternalChanges_To_Entity.pg.sql:
-- CREATE OR REPLACE VIEW can only add trailing columns, so appending preserves
-- existing column names, types and order and completes without a DROP CASCADE
-- that would take dependent views with it. A later CodeGen run may reposition it.
-- ============================================================================

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
    e."SubtypeSelector"
   FROM __mj."Entity" e
     LEFT JOIN __mj."Entity" par ON e."ParentID" = par."ID"
     LEFT JOIN __mj."SchemaInfo" si ON e."SchemaName"::text = si."SchemaName"::text;

/*
================================================================================================
================================================================================================
====                                                                                        ====
====                  GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL                          ====
====                          DO NOT EDIT BY HAND                                           ====
====                                                                                        ====
================================================================================================
================================================================================================

Everything below this block was produced by `mj codegen` against a database carrying the
hand-written DDL above. It is the generated counterpart of that DDL.

WHAT IT CONTAINS
  * The new EntityField row for MJ: Entities.SubtypeSelector. Sequence is an apply-time
    MAX(Sequence)+1 expression.
  * Regenerated spCreateEntity / spUpdateEntity / spDeleteEntity plus their permission grants,
    so the new column round-trips through the write path.
  * sp_refreshview on vwEntities so the new column reaches the read path.
  * Category assignment for SubtypeSelector.

Verified on generation: references __mj throughout with no hardcoded
schema name, and every statement is attributable to the DDL above.

IF THE HAND-WRITTEN DDL ABOVE CHANGES, DO NOT PATCH THIS SECTION BY HAND.
Re-run CodeGen and replace this entire generated section wholesale.
================================================================================================
*/
/* SQL text to insert 2 new entity field(s) */
UPDATE __mj."EntityField" SET "Sequence" = "Sequence" + 100000
WHERE
  "EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6'
  AND "Sequence" < 100000
  AND NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityField"
    WHERE
      "EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Sequence" >= 100000
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0ea58e81-4ec9-4662-9c89-54fd8e98e525' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SubtypeSelector')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0ea58e81-4ec9-4662-9c89-54fd8e98e525', 'E0238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entities */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6'), 'SubtypeSelector', 'Subtype Selector', 'Optional JSON configuration specifying the declarative subtype selector for this entity (shape = IEntitySubtypeSelectorConfig). Path is a dotted foreign-key dereference path ending at a column containing the target subtype entity name (e.g. "ProductID.ProductTypeID.OrderLineExtensionEntity"). Read by BaseEntity.ResolveSubtypeEntityName() as a fallback when no runtime EntitySubtypeResolver is registered, and by offline tooling like Loom and CodeGen to determine conditional IsA child entities. NULL means no declarative subtype selector is configured.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'Entity' AND indexname = 'IDX_AUTO_MJ_FKEY_Entity_ParentID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_Entity_ParentID" ON __mj."Entity"("ParentID");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'Entity' AND indexname = 'IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID" ON __mj."Entity"("ExternalDataSourceID");
  END IF;
END $$;

/* Set categories for 3 fields */
/* UPDATE Entity Field Category Info MJ: Entities.VirtualEntity */
UPDATE __mj."EntityField" SET "DisplayName" = 'Is Virtual Entity'
WHERE
  "ID" = '5F4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entities.Configuration */
UPDATE __mj."EntityField" SET "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EB7D25AC-F5F0-4E4A-B3D8-3AF996FB2C55' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entities.SubtypeSelector */
UPDATE __mj."EntityField" SET "Category" = 'User Interface & Customization', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0EA58E81-4EC9-4662-9C89-54FD8E98E525' AND "AutoUpdateCategory" = TRUE;

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
