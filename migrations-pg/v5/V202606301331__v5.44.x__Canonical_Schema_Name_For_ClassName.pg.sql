-- =============================================================================
-- PostgreSQL counterpart of migration:
--   V202606301331__v5.44.x__Canonical_Schema_Name_For_ClassName.sql
--
-- HAND-AUTHORED. This is a metadata-support-object migration (not a per-entity
-- CodeGen migration), so the automated SS->PG converter cannot produce it
-- correctly: the per-entity baker emits an UNQUOTED getclassnameschemaprefix(...)
-- call, which PostgreSQL folds to lowercase and cannot resolve — the real
-- function is the quoted PascalCase __mj."GetClassNameSchemaPrefix". This file
-- lifts the authoritative PG object definitions directly from the working PG
-- database and from CodeGenLib's metadataSupportObjects.ts.
--
-- Purpose (mirrors the SQL Server migration):
--   Make entity ClassName/CodeName (and the runtime GraphQL type name) derive
--   from a CASE-STABLE canonical schema name, so PostgreSQL installs — where
--   unquoted DDL folds the physical schema to lowercase — still produce
--   PascalCase prefixes matching the published, hand-cased entity packages.
--
-- Changes:
--   STEP 1: SchemaInfo gains a nullable CanonicalSchemaName column. NULL on every
--           existing row/install, on the core __mj schema, and on SQL Server ->
--           COALESCE falls back to SchemaName -> NET-ZERO there. It only matters
--           for custom PascalCase app schemas on PG.
--   STEP 2: vwEntities (a custom, hand-maintained core view) is recreated so the
--           ClassName + CodeName prefix uses
--           GetClassNameSchemaPrefix(COALESCE(CanonicalSchemaName, SchemaName)),
--           and exposes si.CanonicalSchemaName as a virtual EntityInfo field.
--   STEP 3: spUpdateSchemaInfoFromDatabase (a FUNCTION on PG) backfills
--           CanonicalSchemaName from the installed OpenApp record. Lifted verbatim
--           from packages/CodeGenLib/src/Database/providers/postgresql/
--           metadataSupportObjects.ts (the authoritative, regenerated PG shape).
--   Plus:   SchemaInfo base view (vwSchemaInfos) + CRUD functions are re-emitted
--           because the SchemaInfo entity gained a column (CodeGen-native PG output).
--
-- The GetClassNameSchemaPrefix / GetProgrammaticName functions are UNCHANGED —
-- only the input fed to the prefix function changes.
-- =============================================================================


-- =============================================================================
-- STEP 1: Add CanonicalSchemaName column to SchemaInfo (guarded, idempotent).
--         Width matches SchemaName (VARCHAR(50)).
-- =============================================================================
ALTER TABLE __mj."SchemaInfo" ADD COLUMN IF NOT EXISTS "CanonicalSchemaName" VARCHAR(50);

COMMENT ON COLUMN __mj."SchemaInfo"."CanonicalSchemaName" IS
  'Case-stable canonical schema name, sourced from the app manifest (mj-app.json schema.name). Used in place of SchemaName when deriving the schema prefix for entity ClassName/CodeName and GraphQL type names, so that PostgreSQL installs — whose physical SchemaName is folded to lowercase — still produce PascalCase prefixes matching the published, hand-cased entity packages. NULL means "no override": the prefix falls back to SchemaName (every existing install, the core __mj schema, and SQL Server, where SchemaName is already canonical).';


-- =============================================================================
-- STEP 2: Recreate vwEntities preferring CanonicalSchemaName for the class-name
--         prefix. Reproduces the current PG view verbatim (correct quoted
--         __mj."GetClassNameSchemaPrefix"), changing ONLY:
--           - GetClassNameSchemaPrefix(e."SchemaName")
--               -> GetClassNameSchemaPrefix(COALESCE(si."CanonicalSchemaName", e."SchemaName"))
--             in BOTH the CodeName and ClassName expressions, AND
--           - adds si."CanonicalSchemaName" AS "CanonicalSchemaName" to the SELECT.
--         Adding the trailing column is compatible with CREATE OR REPLACE VIEW.
-- =============================================================================
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
    si."CanonicalSchemaName" AS "CanonicalSchemaName"
   FROM __mj."Entity" e
     LEFT JOIN __mj."Entity" par ON e."ParentID" = par."ID"
     LEFT JOIN __mj."SchemaInfo" si ON e."SchemaName"::text = si."SchemaName"::text;

GRANT SELECT ON __mj."vwEntities" TO "cdp_Developer";
GRANT SELECT ON __mj."vwEntities" TO "cdp_Integration";
GRANT SELECT ON __mj."vwEntities" TO "cdp_UI";


-- =============================================================================
-- STEP 3: Backfill CanonicalSchemaName from the installed OpenApp record inside
--         spUpdateSchemaInfoFromDatabase (the CodeGen metadata-sync FUNCTION).
--         Lifted verbatim from CodeGenLib metadataSupportObjects.ts — the
--         authoritative, CanonicalSchemaName-aware PG shape. Keep in sync with
--         the SQL Server proc in the counterpart migration.
-- =============================================================================
DROP FUNCTION IF EXISTS __mj."spUpdateSchemaInfoFromDatabase"(TEXT);
CREATE OR REPLACE FUNCTION __mj."spUpdateSchemaInfoFromDatabase"(p_ExcludedSchemaNames TEXT DEFAULT NULL)
RETURNS SETOF __mj."SchemaInfo"
LANGUAGE plpgsql AS $func$
BEGIN
  DROP TABLE IF EXISTS _usi_excluded;
  CREATE TEMP TABLE _usi_excluded AS
    SELECT TRIM(s) AS schema_name
    FROM unnest(string_to_array(COALESCE(p_ExcludedSchemaNames, ''), ',')) AS s
    WHERE TRIM(s) <> '';

  UPDATE __mj."SchemaInfo" si SET
    "Description" = ss."SchemaDescription",
    "__mj_UpdatedAt" = now()
  FROM __mj."vwSQLSchemas" ss
  WHERE si."SchemaName" = ss."SchemaName"
    AND (si."Description" IS NULL OR si."Description" <> COALESCE(ss."SchemaDescription", ''))
    AND ss."SchemaName" NOT IN (SELECT x.schema_name FROM _usi_excluded x);

  INSERT INTO __mj."SchemaInfo" ("SchemaName", "EntityIDMin", "EntityIDMax", "Comments", "Description")
  SELECT
    ss."SchemaName",
    1,
    999999999,
    'Auto-created by CodeGen. Please update EntityIDMin and EntityIDMax to appropriate values for this schema.',
    ss."SchemaDescription"
  FROM __mj."vwSQLSchemas" ss
  LEFT JOIN __mj."SchemaInfo" si ON ss."SchemaName" = si."SchemaName"
  WHERE si."ID" IS NULL
    AND ss."SchemaName" NOT IN (SELECT x.schema_name FROM _usi_excluded x);

  -- Backfill the case-stable canonical schema name from the installed Open App record.
  -- SchemaInfo.SchemaName is the physical (lowercased) name on PG; the app record carries
  -- the canonical casing (manifest schema.name). Case-insensitive join; only fills NULLs.
  -- Mirrors the SQL Server proc in migration V202606301331 — keep the two in sync.
  UPDATE __mj."SchemaInfo" si SET
    "CanonicalSchemaName" = app."SchemaName",
    "__mj_UpdatedAt" = now()
  FROM __mj."OpenApp" app
  WHERE LOWER(si."SchemaName") = LOWER(app."SchemaName")
    AND si."CanonicalSchemaName" IS NULL
    AND app."SchemaName" IS NOT NULL;

  RETURN QUERY
  SELECT si.*
  FROM __mj."SchemaInfo" si
  INNER JOIN __mj."vwSQLSchemas" ss ON si."SchemaName" = ss."SchemaName"
  WHERE ss."SchemaName" NOT IN (SELECT x.schema_name FROM _usi_excluded x);

  DROP TABLE IF EXISTS _usi_excluded;
END;
$func$;


-- =============================================================================
-- SchemaInfo base view (vwSchemaInfos) — re-emitted to expose the new column.
-- Adding the trailing column is compatible with CREATE OR REPLACE VIEW even
-- though the CRUD functions below RETURN SETOF this view.
-- =============================================================================
CREATE OR REPLACE VIEW __mj."vwSchemaInfos" AS
 SELECT "ID",
    "SchemaName",
    "EntityIDMin",
    "EntityIDMax",
    "Comments",
    "__mj_CreatedAt",
    "__mj_UpdatedAt",
    "Description",
    "EntityNamePrefix",
    "EntityNameSuffix",
    "CanonicalSchemaName"
   FROM __mj."SchemaInfo" s;

GRANT SELECT ON __mj."vwSchemaInfos" TO "cdp_Developer";
GRANT SELECT ON __mj."vwSchemaInfos" TO "cdp_UI";
GRANT SELECT ON __mj."vwSchemaInfos" TO "cdp_Integration";


-- =============================================================================
-- spCreateSchemaInfo — re-emitted with the new CanonicalSchemaName parameter.
-- The signature changed (2 new params), so drop ALL overloads by name before
-- recreating (CREATE OR REPLACE would otherwise create a second overload).
-- =============================================================================
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateSchemaInfo'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateSchemaInfo"(
    p_id uuid DEFAULT NULL::uuid,
    p_schemaname character varying DEFAULT NULL::character varying,
    p_entityidmin integer DEFAULT NULL::integer,
    p_entityidmax integer DEFAULT NULL::integer,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL::text,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL::text,
    p_entitynameprefix_clear boolean DEFAULT false,
    p_entitynameprefix character varying DEFAULT NULL::character varying,
    p_entitynamesuffix_clear boolean DEFAULT false,
    p_entitynamesuffix character varying DEFAULT NULL::character varying,
    p_canonicalschemaname_clear boolean DEFAULT false,
    p_canonicalschemaname character varying DEFAULT NULL::character varying
) RETURNS SETOF __mj."vwSchemaInfos"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."SchemaInfo"
        (
            "ID",
            "SchemaName",
                "EntityIDMin",
                "EntityIDMax",
                "Comments",
                "Description",
                "EntityNamePrefix",
                "EntityNameSuffix",
                "CanonicalSchemaName"
        )
    VALUES
        (
            v_new_id,
            p_schemaname,
                p_entityidmin,
                p_entityidmax,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_entitynameprefix_clear = true THEN NULL ELSE COALESCE(p_entitynameprefix, NULL) END,
                CASE WHEN p_entitynamesuffix_clear = true THEN NULL ELSE COALESCE(p_entitynamesuffix, NULL) END,
                CASE WHEN p_canonicalschemaname_clear = true THEN NULL ELSE COALESCE(p_canonicalschemaname, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwSchemaInfos"
    WHERE "ID" = v_new_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION __mj."spCreateSchemaInfo" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateSchemaInfo" TO "cdp_Integration";


-- =============================================================================
-- spUpdateSchemaInfo — re-emitted with the new CanonicalSchemaName parameter.
-- =============================================================================
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateSchemaInfo'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateSchemaInfo"(
    p_id uuid,
    p_schemaname character varying DEFAULT NULL::character varying,
    p_entityidmin integer DEFAULT NULL::integer,
    p_entityidmax integer DEFAULT NULL::integer,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL::text,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL::text,
    p_entitynameprefix_clear boolean DEFAULT false,
    p_entitynameprefix character varying DEFAULT NULL::character varying,
    p_entitynamesuffix_clear boolean DEFAULT false,
    p_entitynamesuffix character varying DEFAULT NULL::character varying,
    p_canonicalschemaname_clear boolean DEFAULT false,
    p_canonicalschemaname character varying DEFAULT NULL::character varying
) RETURNS SETOF __mj."vwSchemaInfos"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."SchemaInfo"
    SET
        "SchemaName" = COALESCE(p_schemaname, "SchemaName"),
        "EntityIDMin" = COALESCE(p_entityidmin, "EntityIDMin"),
        "EntityIDMax" = COALESCE(p_entityidmax, "EntityIDMax"),
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "EntityNamePrefix" = CASE WHEN p_entitynameprefix_clear = true THEN NULL ELSE COALESCE(p_entitynameprefix, "EntityNamePrefix") END,
        "EntityNameSuffix" = CASE WHEN p_entitynamesuffix_clear = true THEN NULL ELSE COALESCE(p_entitynamesuffix, "EntityNameSuffix") END,
        "CanonicalSchemaName" = CASE WHEN p_canonicalschemaname_clear = true THEN NULL ELSE COALESCE(p_canonicalschemaname, "CanonicalSchemaName") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwSchemaInfos"
    WHERE "ID" = p_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION __mj."spUpdateSchemaInfo" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateSchemaInfo" TO "cdp_Integration";


-- =============================================================================
-- spDeleteSchemaInfo — signature unchanged; re-emitted for completeness (CodeGen
-- re-emits all three CRUD functions when the entity's field set changes).
-- =============================================================================
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteSchemaInfo'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteSchemaInfo"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."SchemaInfo"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION __mj."spDeleteSchemaInfo" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteSchemaInfo" TO "cdp_Integration";
