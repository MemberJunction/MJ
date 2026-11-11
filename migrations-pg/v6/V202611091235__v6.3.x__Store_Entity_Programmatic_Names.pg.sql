-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611091235__v6.3.x__Store_Entity_Programmatic_Names.sql
-- Hand-ported PostgreSQL counterpart (no CodeGen output: the SQL Server migration has none).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ HAND-PORTED FOR POSTGRESQL — review this whole file ══╗
-- The converter flags 4 routines (GetEntityProgrammaticNames + 3 triggers) as needs-hand and cannot
-- emit 9 statements (the triggers, the CREATE OR ALTER VIEWs over e.* / ef.*, and 6 sp_refreshview),
-- so the file is ported by hand. Same objects, names and formulas as SQL Server; differences:
--
--  1. VIEWS. vwEntities and vwEntityFields are app-owned (BaseViewGenerated = 0). On SQL Server they
--     select e.* / ef.*, so the stored columns replace the computed ones by name. On PostgreSQL both
--     views have an explicit column list frozen at CREATE (DEPLOYMENT.md "App-owned base views").
--     They already expose CodeName / ClassName / BaseTableCodeName / FieldCodeName as computed
--     columns, so each is redefined with CREATE OR REPLACE, keeping every column in place and
--     changing only those four expressions to read the stored column. Same names, same type (text,
--     which is what GetProgrammaticName returns), same positions. This avoids DROP ... CASCADE and
--     leaves every dependent view (vwEntityFields, vwEntityRelationships, vwApplicationEntities,
--     vwUserFavorites, ...) bound as before, so the six sp_refreshview calls have no PostgreSQL
--     equivalent to port.
--
--  2. TRIGGERS. SQL Server uses AFTER triggers that UPDATE the affected rows. On PostgreSQL the
--     Entity and EntityField triggers are BEFORE ... FOR EACH ROW triggers that set NEW directly,
--     with the same firing columns (UPDATE OF ... = SQL Server's UPDATE(col)) and the same effect:
--     a direct write to a stored name is replaced by the computed value. No second UPDATE per row.
--     A BEFORE INSERT row is not yet in the table, so these two triggers evaluate the same formula
--     as GetEntityProgrammaticNames() on NEW instead of calling it. The SchemaInfo trigger stays an
--     AFTER trigger (it rewrites other tables' rows) and calls GetEntityProgrammaticNames(), as on
--     SQL Server. Comparisons use IS DISTINCT FROM, which is case-sensitive on PostgreSQL (the
--     Latin1_General_BIN2 compare on SQL Server).
--
--  3. GetEntityProgrammaticNames is a LANGUAGE sql STABLE set-returning function (the inline TVF).
--     IIF -> CASE, ISNULL -> COALESCE, + -> || (both yield NULL on a NULL operand).
--
-- Verify: on a migrated DB, every Entity/EntityField row's stored names equal what the old view
-- expressions returned (checked on the gate DB: 0 mismatches).
-- ╚══════════════════════════════════════════════════════════╝

-- ── 1. Stored columns. Nullable: the triggers fill them. ──
ALTER TABLE __mj."Entity"
    ADD COLUMN "CodeName" TEXT NULL,
    ADD COLUMN "ClassName" TEXT NULL,
    ADD COLUMN "BaseTableCodeName" TEXT NULL;

ALTER TABLE __mj."EntityField"
    ADD COLUMN "FieldCodeName" TEXT NULL;

COMMENT ON COLUMN __mj."Entity"."CodeName" IS 'Schema-prefixed programmatic name derived from the entity Name: GetClassNameSchemaPrefix(COALESCE(CanonicalSchemaName, SchemaName)) followed by the Name with the schema''s EntityNamePrefix and spaces removed. Maintained by trigger; read-only.';
COMMENT ON COLUMN __mj."Entity"."ClassName" IS 'Schema-prefixed programmatic class name used for TypeScript entity classes, Zod schemas and Angular form components: GetProgrammaticName(GetClassNameSchemaPrefix(COALESCE(CanonicalSchemaName, SchemaName)) + BaseTable + NameSuffix). Maintained by trigger; read-only.';
COMMENT ON COLUMN __mj."Entity"."BaseTableCodeName" IS 'Programmatic name of the base table plus NameSuffix, without a schema prefix: GetProgrammaticName(BaseTable + NameSuffix). Used to name generated procedures and triggers. Maintained by trigger; read-only.';
COMMENT ON COLUMN __mj."EntityField"."FieldCodeName" IS 'Programmatic name of the field: GetProgrammaticName of the Name with spaces removed. Maintained by trigger; read-only.';

-- ── 2. The one definition of the entity-level names (backfill + SchemaInfo trigger). ──
CREATE OR REPLACE FUNCTION __mj."GetEntityProgrammaticNames"()
RETURNS TABLE ("ID" uuid, "CodeName" text, "ClassName" text, "BaseTableCodeName" text)
LANGUAGE sql
STABLE
AS $fn$
    SELECT
        e."ID",
        __mj."GetProgrammaticName"(
            __mj."GetClassNameSchemaPrefix"(COALESCE(si."CanonicalSchemaName", e."SchemaName"))::text ||
            replace(
                CASE WHEN si."EntityNamePrefix" IS NOT NULL THEN replace(e."Name"::text, si."EntityNamePrefix"::text, '') ELSE e."Name"::text END,
                ' ',
                ''
            )
        ),
        __mj."GetProgrammaticName"(
            __mj."GetClassNameSchemaPrefix"(COALESCE(si."CanonicalSchemaName", e."SchemaName"))::text ||
            e."BaseTable"::text ||
            COALESCE(e."NameSuffix"::text, '')
        ),
        __mj."GetProgrammaticName"(e."BaseTable"::text || COALESCE(e."NameSuffix"::text, ''))
    FROM __mj."Entity" e
    LEFT OUTER JOIN __mj."SchemaInfo" si ON e."SchemaName" = si."SchemaName";
$fn$;

-- ── 3. Backfill existing rows (before the triggers exist, so each row is written once). ──
UPDATE __mj."Entity" e
SET "CodeName" = n."CodeName",
    "ClassName" = n."ClassName",
    "BaseTableCodeName" = n."BaseTableCodeName"
FROM __mj."GetEntityProgrammaticNames"() n
WHERE n."ID" = e."ID";

UPDATE __mj."EntityField"
SET "FieldCodeName" = __mj."GetProgrammaticName"(replace("Name"::text, ' ', ''));

-- ── 4. Triggers. Names avoid CodeGen's trgUpdate<Table> / trg_update_<table> patterns. ──
CREATE OR REPLACE FUNCTION __mj."trgEntity_SyncProgrammaticNames_func"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $trg$
DECLARE
    v_prefix text;
    v_entity_name_prefix text;
BEGIN
    SELECT __mj."GetClassNameSchemaPrefix"(COALESCE(si."CanonicalSchemaName", NEW."SchemaName"))::text, si."EntityNamePrefix"::text
      INTO v_prefix, v_entity_name_prefix
      FROM (SELECT 1) one
      LEFT OUTER JOIN __mj."SchemaInfo" si ON si."SchemaName" = NEW."SchemaName";
    NEW."CodeName" := __mj."GetProgrammaticName"(
        v_prefix ||
        replace(
            CASE WHEN v_entity_name_prefix IS NOT NULL THEN replace(NEW."Name"::text, v_entity_name_prefix, '') ELSE NEW."Name"::text END,
            ' ',
            ''
        )
    );
    NEW."ClassName" := __mj."GetProgrammaticName"(v_prefix || NEW."BaseTable"::text || COALESCE(NEW."NameSuffix"::text, ''));
    NEW."BaseTableCodeName" := __mj."GetProgrammaticName"(NEW."BaseTable"::text || COALESCE(NEW."NameSuffix"::text, ''));
    RETURN NEW;
END;
$trg$;

DROP TRIGGER IF EXISTS "trgEntity_SyncProgrammaticNames" ON __mj."Entity";
CREATE TRIGGER "trgEntity_SyncProgrammaticNames"
    BEFORE INSERT OR UPDATE OF "Name", "NameSuffix", "BaseTable", "SchemaName", "CodeName", "ClassName", "BaseTableCodeName"
    ON __mj."Entity"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgEntity_SyncProgrammaticNames_func"();

CREATE OR REPLACE FUNCTION __mj."trgSchemaInfo_SyncEntityProgrammaticNames_func"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $trg$
DECLARE
    v_schemas text[];
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_schemas := ARRAY[NEW."SchemaName"::text];
    ELSIF TG_OP = 'DELETE' THEN
        v_schemas := ARRAY[OLD."SchemaName"::text];
    ELSE
        v_schemas := ARRAY[NEW."SchemaName"::text, OLD."SchemaName"::text];
    END IF;

    UPDATE __mj."Entity" e
    SET "CodeName" = n."CodeName",
        "ClassName" = n."ClassName",
        "BaseTableCodeName" = n."BaseTableCodeName"
    FROM __mj."GetEntityProgrammaticNames"() n
    WHERE n."ID" = e."ID"
      AND e."SchemaName"::text = ANY (v_schemas)
      AND (e."CodeName", e."ClassName", e."BaseTableCodeName")
          IS DISTINCT FROM (n."CodeName", n."ClassName", n."BaseTableCodeName");
    RETURN NULL;
END;
$trg$;

DROP TRIGGER IF EXISTS "trgSchemaInfo_SyncEntityProgrammaticNames" ON __mj."SchemaInfo";
CREATE TRIGGER "trgSchemaInfo_SyncEntityProgrammaticNames"
    AFTER INSERT OR DELETE OR UPDATE OF "SchemaName", "EntityNamePrefix", "CanonicalSchemaName"
    ON __mj."SchemaInfo"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgSchemaInfo_SyncEntityProgrammaticNames_func"();

CREATE OR REPLACE FUNCTION __mj."trgEntityField_SyncFieldCodeName_func"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $trg$
BEGIN
    NEW."FieldCodeName" := __mj."GetProgrammaticName"(replace(NEW."Name"::text, ' ', ''));
    RETURN NEW;
END;
$trg$;

DROP TRIGGER IF EXISTS "trgEntityField_SyncFieldCodeName" ON __mj."EntityField";
CREATE TRIGGER "trgEntityField_SyncFieldCodeName"
    BEFORE INSERT OR UPDATE OF "Name", "FieldCodeName"
    ON __mj."EntityField"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgEntityField_SyncFieldCodeName_func"();

-- ── 5. Views read the stored columns instead of computing them (see banner, point 1). ──
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
    e."CodeName",
    e."ClassName",
    e."BaseTableCodeName",
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

CREATE OR REPLACE VIEW __mj."vwEntityFields" AS
SELECT ef."ID",
    ef."EntityID",
    ef."Sequence",
    ef."Name",
    ef."DisplayName",
    ef."Description",
    ef."AutoUpdateDescription",
    ef."IsPrimaryKey",
    ef."IsUnique",
    ef."Category",
    ef."Type",
    ef."Length",
    ef."Precision",
    ef."Scale",
    ef."AllowsNull",
    ef."DefaultValue",
    ef."AutoIncrement",
    ef."ValueListType",
    ef."ExtendedType",
    ef."CodeType",
    ef."DefaultInView",
    ef."ViewCellTemplate",
    ef."DefaultColumnWidth",
    ef."AllowUpdateAPI",
    ef."AllowUpdateInView",
    ef."IncludeInUserSearchAPI",
    ef."FullTextSearchEnabled",
    ef."UserSearchParamFormatAPI",
    ef."IncludeInGeneratedForm",
    ef."GeneratedFormSection",
    ef."IsVirtual",
    ef."IsNameField",
    ef."RelatedEntityID",
    ef."RelatedEntityFieldName",
    ef."IncludeRelatedEntityNameFieldInBaseView",
    ef."RelatedEntityNameFieldMap",
    ef."RelatedEntityDisplayType",
    ef."EntityIDFieldName",
    ef."__mj_CreatedAt",
    ef."__mj_UpdatedAt",
    ef."ScopeDefault",
    ef."AutoUpdateRelatedEntityInfo",
    ef."ValuesToPackWithSchema",
    ef."Status",
    ef."AutoUpdateIsNameField",
    ef."AutoUpdateDefaultInView",
    ef."AutoUpdateCategory",
    ef."AutoUpdateDisplayName",
    ef."AutoUpdateIncludeInUserSearchAPI",
    ef."Encrypt",
    ef."EncryptionKeyID",
    ef."AllowDecryptInAPI",
    ef."SendEncryptedValue",
    ef."IsSoftPrimaryKey",
    ef."IsSoftForeignKey",
    ef."RelatedEntityJoinFields",
    ef."JSONType",
    ef."JSONTypeIsArray",
    ef."JSONTypeDefinition",
    ef."UserSearchPredicateAPI",
    ef."AutoUpdateUserSearchPredicate",
    ef."AutoUpdateFullTextSearch",
    ef."AutoUpdateExtendedType",
    ef."IsComputed",
    ef."FieldCodeName",
    e."Name" AS "Entity",
    e."SchemaName",
    e."BaseTable",
    e."BaseView",
    e."CodeName" AS "EntityCodeName",
    e."ClassName" AS "EntityClassName",
    re."Name" AS "RelatedEntity",
    re."SchemaName" AS "RelatedEntitySchemaName",
    re."BaseTable" AS "RelatedEntityBaseTable",
    re."BaseView" AS "RelatedEntityBaseView",
    re."CodeName" AS "RelatedEntityCodeName",
    re."ClassName" AS "RelatedEntityClassName",
    ef."EmbeddedRecord",
    ef."Configuration"
   FROM __mj."EntityField" ef
     JOIN __mj."vwEntities" e ON ef."EntityID" = e."ID"
     LEFT JOIN __mj."vwEntities" re ON ef."RelatedEntityID" = re."ID";

-- (SQL Server's six sp_refreshview calls: not needed — both views keep their column lists.)
