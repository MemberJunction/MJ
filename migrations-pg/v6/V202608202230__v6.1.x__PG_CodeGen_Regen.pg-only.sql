-- ============================================================================
-- PG-ONLY: CodeGen object regeneration for the v6.1.0-edge.3 content
--
-- WHY THIS FILE EXISTS. On SQL Server every migration that changes a table carries its regenerated
-- CodeGen objects inline. On PostgreSQL the split-and-regenerate converter classifies those objects
-- as "regenerated natively" and emits DDL only, so the twelve counterparts in this release ship
-- schema changes with no views and no CRUD routines to match. The failure does not surface where it
-- is caused: `mj migrate` gets all the way to Metadata_Sync and dies there, because that migration
-- calls routine signatures the new columns created --
-- `function __mj.spCreateAuthenticationProvider(... p_sequence => integer) does not exist`.
--
-- STAMPED BEFORE Metadata_Sync ON PURPOSE (2230 vs 2231). Stamped after it, the release cannot
-- apply at all.
--
-- SCOPE IS BY ENTITY, NOT BY DIFF. This carries the base views and CRUD routines for the eleven
-- base tables this release alters or creates: AuthenticationProvider, CompanyIntegrationRun,
-- Entity, EntityField, EntityRelationship, FileStorageProvider, FormChromeRule, MaterializedResult,
-- MaterializedResultQuery, Query, RSUPendingWork.
--
-- That scoping is deliberate and was measured. A fresh `mj codegen` against a PostgreSQL database
-- holding this release's DDL reports 1,178 view/function definitions that differ from the ones the
-- committed ledger baked -- ~1,100 of them routines this release never touches, differing only
-- because the ledger baked them at various earlier points and the generator's output has moved
-- since. Shipping that whole delta would rewrite a thousand objects under cover of a release that
-- changes eleven tables. So the delta is NOT the scope; the entities are.
--
-- SECTION 1 REPAIRS APP-OWNED BASE VIEWS, WHICH CODEGEN CANNOT TOUCH.
-- An entity with BaseViewGenerated = 0 owns its base view, and CodeGen never rewrites it. On SQL
-- Server the migrations keep such a view current with `sp_refreshview` (this release calls it on
-- vwEntities and vwEntityRelationships). PostgreSQL has no equivalent -- it expands and FREEZES a
-- view's column list at CREATE -- so on PostgreSQL those columns never reach the read path at all.
--
-- Four app-owned views were short seventeen columns between them:
--   vwCompanyIntegrationRuns  +6  OwnerToken, LeaseExpiresAt, HeartbeatAt, FenceToken,
--                                 CancelRequestedAt, ProgressJSON      (this release)
--   vwEntities                +7  Configuration                        (this release)
--                                 ExternalDataSourceID, ExternalObjectName, GeneratedBaseViewName,
--                                 AllowDirectSQLInsert/Update/Delete   (earlier releases, never
--                                                                       landed on PostgreSQL)
--   vwEntityFields            +2  EmbeddedRecord, Configuration        (this release)
--   vwEntityRelationships     +2  RelatedRecordCollection, Configuration
--
-- Leaving them stale is not a cosmetic gap. `spDeleteUnneededEntityFields` treats a metadata field
-- with no matching view column as unneeded and DELETES the EntityField row; the CRUD routines then
-- regenerate without it. That was observed, not theorised: a CodeGen run against the stale views
-- deleted six EntityField rows on MJ: Entities and regenerated spUpdateEntity with 84 parameters
-- where the committed ledger already had 89.
--
-- CREATE OR REPLACE, not DROP + CREATE. These four views have six dependents between them
-- (vwApplicationEntities, vwEntitiesWithExternalChangeTracking, vwEntitiesWithMissingBaseTables,
-- vwEntityFields, vwEntityRelationships, vwUserFavorites). PostgreSQL permits a replace that
-- APPENDS columns while refusing one that renames or reorders them, so each definition below is the
-- existing one reproduced verbatim with the missing columns added at the end. The new columns
-- therefore sit after the computed/joined columns rather than in table order, which differs from
-- where sp_refreshview would put them on SQL Server; nothing reads these views positionally.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- It does not regenerate the hierarchy base views (Root<Field>/Depth/Path/IsLeaf/ChildCount). Those
-- are gated on EntityField.Configuration -> Hierarchy.IsHierarchy, which reaches a database through
-- metadata -- that is, through Metadata_Sync, which is stamped AFTER this file. A base view cannot
-- be generated with hierarchy columns before the metadata that declares the hierarchy exists. On
-- PostgreSQL today zero of the thirty-one entities declaring RootParentID have it in their base
-- view, so omitting them preserves the existing state rather than regressing anything. Tracked
-- separately; see the release notes for this build.
--
-- Objects below are `mj codegen` output verbatim, schema-qualified as __mj -- the same literal the
-- twelve transpiled counterparts in this release use, since the converter emits it too.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — app-owned base views (CodeGen cannot generate these)
-- ============================================================================
-- vwCompanyIntegrationRuns: appending 6 column(s) missing from the frozen view -- OwnerToken, LeaseExpiresAt, HeartbeatAt, FenceToken, CancelRequestedAt, ProgressJSON
CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationRuns" AS
SELECT cir."ID",
    cir."CompanyIntegrationID",
    cir."RunByUserID",
    cir."StartedAt",
    cir."EndedAt",
    cir."TotalRecords",
    cir."Comments",
    cir."__mj_CreatedAt",
    cir."__mj_UpdatedAt",
    cir."Status",
    cir."ErrorLog",
    cir."ConfigData",
    cir."ScheduledJobRunID",
    i."Name" AS "Integration",
    c."Name" AS "Company",
    u."Name" AS "RunByUser",
    cir."OwnerToken",
    cir."LeaseExpiresAt",
    cir."HeartbeatAt",
    cir."FenceToken",
    cir."CancelRequestedAt",
    cir."ProgressJSON"
   FROM __mj."CompanyIntegrationRun" cir
     JOIN __mj."CompanyIntegration" ci ON cir."CompanyIntegrationID" = ci."ID"
     JOIN __mj."Company" c ON ci."CompanyID" = c."ID"
     JOIN __mj."User" u ON cir."RunByUserID" = u."ID"
     JOIN __mj."Integration" i ON ci."IntegrationID" = i."ID";

-- vwEntities: appending 7 column(s) missing from the frozen view -- ExternalDataSourceID, ExternalObjectName, GeneratedBaseViewName, AllowDirectSQLInsert, AllowDirectSQLUpdate, AllowDirectSQLDelete, Configuration
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
    e."Configuration"
   FROM __mj."Entity" e
     LEFT JOIN __mj."Entity" par ON e."ParentID" = par."ID"
     LEFT JOIN __mj."SchemaInfo" si ON e."SchemaName"::text = si."SchemaName"::text;

-- vwEntityFields: appending 2 column(s) missing from the frozen view -- EmbeddedRecord, Configuration
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
    __mj."GetProgrammaticName"(replace(ef."Name"::text, ' '::text, ''::text)) AS "FieldCodeName",
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

-- vwEntityRelationships: appending 2 column(s) missing from the frozen view -- RelatedRecordCollection, Configuration
CREATE OR REPLACE VIEW __mj."vwEntityRelationships" AS
SELECT er."ID",
    er."EntityID",
    er."Sequence",
    er."RelatedEntityID",
    er."BundleInAPI",
    er."IncludeInParentAllQuery",
    er."Type",
    er."EntityKeyField",
    er."RelatedEntityJoinField",
    er."JoinView",
    er."JoinEntityJoinField",
    er."JoinEntityInverseJoinField",
    er."DisplayInForm",
    er."DisplayLocation",
    er."DisplayName",
    er."DisplayIconType",
    er."DisplayIcon",
    er."DisplayUserViewID",
    er."DisplayComponentID",
    er."DisplayComponentConfiguration",
    er."__mj_CreatedAt",
    er."__mj_UpdatedAt",
    er."AutoUpdateFromSchema",
    er."AdditionalFieldsToInclude",
    er."AutoUpdateAdditionalFieldsToInclude",
    e."Name" AS "Entity",
    e."BaseTable" AS "EntityBaseTable",
    e."BaseView" AS "EntityBaseView",
    relatedentity."Name" AS "RelatedEntity",
    relatedentity."BaseTable" AS "RelatedEntityBaseTable",
    relatedentity."BaseView" AS "RelatedEntityBaseView",
    relatedentity."ClassName" AS "RelatedEntityClassName",
    relatedentity."CodeName" AS "RelatedEntityCodeName",
    relatedentity."BaseTableCodeName" AS "RelatedEntityBaseTableCodeName",
    uv."Name" AS "DisplayUserViewName",
    er."RelatedRecordCollection",
    er."Configuration"
   FROM __mj."EntityRelationship" er
     JOIN __mj."Entity" e ON er."EntityID" = e."ID"
     JOIN __mj."vwEntities" relatedentity ON er."RelatedEntityID" = relatedentity."ID"
     LEFT JOIN __mj."UserView" uv ON er."DisplayUserViewID" = uv."ID";

-- ============================================================================
-- SECTION 2 — generated base views and CRUD routines for the eleven affected entities

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Authentication Providers
-- Item: vwAuthenticationProviders
-- Generated at: 2026-08-20T23:47:33.715Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Authentication Providers
-----               SCHEMA:      __mj
-----               BASE TABLE:  AuthenticationProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAuthenticationProviders"
AS
SELECT
    a.*,
    MJCredential_CredentialID."Name" AS "Credential"
FROM
    "__mj"."AuthenticationProvider" AS a
LEFT OUTER JOIN
    "__mj"."Credential" AS MJCredential_CredentialID
  ON
    "a"."CredentialID" = MJCredential_CredentialID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAuthenticationProviders'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAuthenticationProviders'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAuthenticationProviders'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwAuthenticationProviders" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAuthenticationProviders" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAuthenticationProviders" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAuthenticationProviders" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Authentication Providers
-- Item: Permissions for vwAuthenticationProviders
-- Generated at: 2026-08-20T23:47:33.717Z
-- ============================================================
GRANT SELECT ON "__mj"."vwAuthenticationProviders" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAuthenticationProviders" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAuthenticationProviders" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Authentication Providers
-- Item: spCreateAuthenticationProvider
-- Generated at: 2026-08-20T23:47:33.717Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AuthenticationProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAuthenticationProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAuthenticationProvider"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_driverclass varchar(255) DEFAULT NULL,
    p_issuer_clear boolean DEFAULT false,
    p_issuer varchar(500) DEFAULT NULL,
    p_audience_clear boolean DEFAULT false,
    p_audience varchar(500) DEFAULT NULL,
    p_jwksuri_clear boolean DEFAULT false,
    p_jwksuri varchar(500) DEFAULT NULL,
    p_clientid_clear boolean DEFAULT false,
    p_clientid varchar(255) DEFAULT NULL,
    p_domain_clear boolean DEFAULT false,
    p_domain varchar(255) DEFAULT NULL,
    p_scopes_clear boolean DEFAULT false,
    p_scopes varchar(500) DEFAULT NULL,
    p_additionalconfiguration_clear boolean DEFAULT false,
    p_additionalconfiguration TEXT DEFAULT NULL,
    p_clientconfiguration_clear boolean DEFAULT false,
    p_clientconfiguration TEXT DEFAULT NULL,
    p_credentialid_clear boolean DEFAULT false,
    p_credentialid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_clientvisible BOOLEAN DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(100) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(100) DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF "__mj"."vwAuthenticationProviders" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AuthenticationProvider"
        (
            "ID",
            "Name",
                "Description",
                "DriverClass",
                "Issuer",
                "Audience",
                "JWKSUri",
                "ClientID",
                "Domain",
                "Scopes",
                "AdditionalConfiguration",
                "ClientConfiguration",
                "CredentialID",
                "Status",
                "IsDefault",
                "ClientVisible",
                "DisplayName",
                "Icon",
                "Sequence"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_driverclass,
                CASE WHEN p_issuer_clear = true THEN NULL ELSE COALESCE(p_issuer, NULL) END,
                CASE WHEN p_audience_clear = true THEN NULL ELSE COALESCE(p_audience, NULL) END,
                CASE WHEN p_jwksuri_clear = true THEN NULL ELSE COALESCE(p_jwksuri, NULL) END,
                CASE WHEN p_clientid_clear = true THEN NULL ELSE COALESCE(p_clientid, NULL) END,
                CASE WHEN p_domain_clear = true THEN NULL ELSE COALESCE(p_domain, NULL) END,
                CASE WHEN p_scopes_clear = true THEN NULL ELSE COALESCE(p_scopes, NULL) END,
                CASE WHEN p_additionalconfiguration_clear = true THEN NULL ELSE COALESCE(p_additionalconfiguration, NULL) END,
                CASE WHEN p_clientconfiguration_clear = true THEN NULL ELSE COALESCE(p_clientconfiguration, NULL) END,
                CASE WHEN p_credentialid_clear = true THEN NULL ELSE COALESCE(p_credentialid, NULL) END,
                COALESCE(p_status, 'Active'),
                COALESCE(p_isdefault, FALSE),
                COALESCE(p_clientvisible, TRUE),
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                COALESCE(p_sequence, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAuthenticationProviders"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAuthenticationProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAuthenticationProvider" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spCreateAuthenticationProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAuthenticationProvider" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Authentication Providers
-- Item: spUpdateAuthenticationProvider
-- Generated at: 2026-08-20T23:47:33.717Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AuthenticationProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAuthenticationProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAuthenticationProvider"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_driverclass varchar(255) DEFAULT NULL,
    p_issuer_clear boolean DEFAULT false,
    p_issuer varchar(500) DEFAULT NULL,
    p_audience_clear boolean DEFAULT false,
    p_audience varchar(500) DEFAULT NULL,
    p_jwksuri_clear boolean DEFAULT false,
    p_jwksuri varchar(500) DEFAULT NULL,
    p_clientid_clear boolean DEFAULT false,
    p_clientid varchar(255) DEFAULT NULL,
    p_domain_clear boolean DEFAULT false,
    p_domain varchar(255) DEFAULT NULL,
    p_scopes_clear boolean DEFAULT false,
    p_scopes varchar(500) DEFAULT NULL,
    p_additionalconfiguration_clear boolean DEFAULT false,
    p_additionalconfiguration TEXT DEFAULT NULL,
    p_clientconfiguration_clear boolean DEFAULT false,
    p_clientconfiguration TEXT DEFAULT NULL,
    p_credentialid_clear boolean DEFAULT false,
    p_credentialid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_clientvisible BOOLEAN DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(100) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(100) DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF "__mj"."vwAuthenticationProviders" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AuthenticationProvider"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "DriverClass" = COALESCE(p_driverclass, "DriverClass"),
        "Issuer" = CASE WHEN p_issuer_clear = true THEN NULL ELSE COALESCE(p_issuer, "Issuer") END,
        "Audience" = CASE WHEN p_audience_clear = true THEN NULL ELSE COALESCE(p_audience, "Audience") END,
        "JWKSUri" = CASE WHEN p_jwksuri_clear = true THEN NULL ELSE COALESCE(p_jwksuri, "JWKSUri") END,
        "ClientID" = CASE WHEN p_clientid_clear = true THEN NULL ELSE COALESCE(p_clientid, "ClientID") END,
        "Domain" = CASE WHEN p_domain_clear = true THEN NULL ELSE COALESCE(p_domain, "Domain") END,
        "Scopes" = CASE WHEN p_scopes_clear = true THEN NULL ELSE COALESCE(p_scopes, "Scopes") END,
        "AdditionalConfiguration" = CASE WHEN p_additionalconfiguration_clear = true THEN NULL ELSE COALESCE(p_additionalconfiguration, "AdditionalConfiguration") END,
        "ClientConfiguration" = CASE WHEN p_clientconfiguration_clear = true THEN NULL ELSE COALESCE(p_clientconfiguration, "ClientConfiguration") END,
        "CredentialID" = CASE WHEN p_credentialid_clear = true THEN NULL ELSE COALESCE(p_credentialid, "CredentialID") END,
        "Status" = COALESCE(p_status, "Status"),
        "IsDefault" = COALESCE(p_isdefault, "IsDefault"),
        "ClientVisible" = COALESCE(p_clientvisible, "ClientVisible"),
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "Icon" = CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, "Icon") END,
        "Sequence" = COALESCE(p_sequence, "Sequence")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAuthenticationProviders"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAuthenticationProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAuthenticationProvider" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AuthenticationProvider table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_authentication_provider"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_authentication_provider" ON "__mj"."AuthenticationProvider";

CREATE TRIGGER "trg_update_authentication_provider"
BEFORE UPDATE ON "__mj"."AuthenticationProvider"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_authentication_provider"();


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAuthenticationProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAuthenticationProvider" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Authentication Providers
-- Item: spDeleteAuthenticationProvider
-- Generated at: 2026-08-20T23:47:33.718Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AuthenticationProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAuthenticationProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAuthenticationProvider"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AuthenticationProvider"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAuthenticationProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAuthenticationProvider" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAuthenticationProvider" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAuthenticationProvider" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Runs
-- Item: spCreateCompanyIntegrationRun
-- Generated at: 2026-08-20T23:47:33.807Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR CompanyIntegrationRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateCompanyIntegrationRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateCompanyIntegrationRun"(
    p_id UUID DEFAULT NULL,
    p_companyintegrationid UUID DEFAULT NULL,
    p_runbyuserid UUID DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_totalrecords int DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_errorlog_clear boolean DEFAULT false,
    p_errorlog TEXT DEFAULT NULL,
    p_configdata_clear boolean DEFAULT false,
    p_configdata TEXT DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_ownertoken_clear boolean DEFAULT false,
    p_ownertoken UUID DEFAULT NULL,
    p_leaseexpiresat_clear boolean DEFAULT false,
    p_leaseexpiresat TIMESTAMPTZ DEFAULT NULL,
    p_heartbeatat_clear boolean DEFAULT false,
    p_heartbeatat TIMESTAMPTZ DEFAULT NULL,
    p_fencetoken int DEFAULT NULL,
    p_cancelrequestedat_clear boolean DEFAULT false,
    p_cancelrequestedat TIMESTAMPTZ DEFAULT NULL,
    p_progressjson_clear boolean DEFAULT false,
    p_progressjson TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."CompanyIntegrationRun"
        (
            "ID",
            "CompanyIntegrationID",
                "RunByUserID",
                "StartedAt",
                "EndedAt",
                "TotalRecords",
                "Comments",
                "Status",
                "ErrorLog",
                "ConfigData",
                "ScheduledJobRunID",
                "OwnerToken",
                "LeaseExpiresAt",
                "HeartbeatAt",
                "FenceToken",
                "CancelRequestedAt",
                "ProgressJSON"
        )
    VALUES
        (
            v_new_id,
            p_companyintegrationid,
                p_runbyuserid,
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END,
                p_totalrecords,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_errorlog_clear = true THEN NULL ELSE COALESCE(p_errorlog, NULL) END,
                CASE WHEN p_configdata_clear = true THEN NULL ELSE COALESCE(p_configdata, NULL) END,
                CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, NULL) END,
                CASE WHEN p_ownertoken_clear = true THEN NULL ELSE COALESCE(p_ownertoken, NULL) END,
                CASE WHEN p_leaseexpiresat_clear = true THEN NULL ELSE COALESCE(p_leaseexpiresat, NULL) END,
                CASE WHEN p_heartbeatat_clear = true THEN NULL ELSE COALESCE(p_heartbeatat, NULL) END,
                COALESCE(p_fencetoken, 0),
                CASE WHEN p_cancelrequestedat_clear = true THEN NULL ELSE COALESCE(p_cancelrequestedat, NULL) END,
                CASE WHEN p_progressjson_clear = true THEN NULL ELSE COALESCE(p_progressjson, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationRun" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Runs
-- Item: spUpdateCompanyIntegrationRun
-- Generated at: 2026-08-20T23:47:33.807Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR CompanyIntegrationRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateCompanyIntegrationRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateCompanyIntegrationRun"(
    p_id UUID,
    p_companyintegrationid UUID DEFAULT NULL,
    p_runbyuserid UUID DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_totalrecords int DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_errorlog_clear boolean DEFAULT false,
    p_errorlog TEXT DEFAULT NULL,
    p_configdata_clear boolean DEFAULT false,
    p_configdata TEXT DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_ownertoken_clear boolean DEFAULT false,
    p_ownertoken UUID DEFAULT NULL,
    p_leaseexpiresat_clear boolean DEFAULT false,
    p_leaseexpiresat TIMESTAMPTZ DEFAULT NULL,
    p_heartbeatat_clear boolean DEFAULT false,
    p_heartbeatat TIMESTAMPTZ DEFAULT NULL,
    p_fencetoken int DEFAULT NULL,
    p_cancelrequestedat_clear boolean DEFAULT false,
    p_cancelrequestedat TIMESTAMPTZ DEFAULT NULL,
    p_progressjson_clear boolean DEFAULT false,
    p_progressjson TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."CompanyIntegrationRun"
    SET
        "CompanyIntegrationID" = COALESCE(p_companyintegrationid, "CompanyIntegrationID"),
        "RunByUserID" = COALESCE(p_runbyuserid, "RunByUserID"),
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "TotalRecords" = COALESCE(p_totalrecords, "TotalRecords"),
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "Status" = COALESCE(p_status, "Status"),
        "ErrorLog" = CASE WHEN p_errorlog_clear = true THEN NULL ELSE COALESCE(p_errorlog, "ErrorLog") END,
        "ConfigData" = CASE WHEN p_configdata_clear = true THEN NULL ELSE COALESCE(p_configdata, "ConfigData") END,
        "ScheduledJobRunID" = CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, "ScheduledJobRunID") END,
        "OwnerToken" = CASE WHEN p_ownertoken_clear = true THEN NULL ELSE COALESCE(p_ownertoken, "OwnerToken") END,
        "LeaseExpiresAt" = CASE WHEN p_leaseexpiresat_clear = true THEN NULL ELSE COALESCE(p_leaseexpiresat, "LeaseExpiresAt") END,
        "HeartbeatAt" = CASE WHEN p_heartbeatat_clear = true THEN NULL ELSE COALESCE(p_heartbeatat, "HeartbeatAt") END,
        "FenceToken" = COALESCE(p_fencetoken, "FenceToken"),
        "CancelRequestedAt" = CASE WHEN p_cancelrequestedat_clear = true THEN NULL ELSE COALESCE(p_cancelrequestedat, "CancelRequestedAt") END,
        "ProgressJSON" = CASE WHEN p_progressjson_clear = true THEN NULL ELSE COALESCE(p_progressjson, "ProgressJSON") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_company_integration_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_company_integration_run" ON "__mj"."CompanyIntegrationRun";

CREATE TRIGGER "trg_update_company_integration_run"
BEFORE UPDATE ON "__mj"."CompanyIntegrationRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_company_integration_run"();


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Runs
-- Item: spDeleteCompanyIntegrationRun
-- Generated at: 2026-08-20T23:47:33.808Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR CompanyIntegrationRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteCompanyIntegrationRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteCompanyIntegrationRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."CompanyIntegrationRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationRun" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spCreateEntity
-- Generated at: 2026-08-20T23:47:34.211Z
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
    FOREACH v_field_name IN ARRAY ARRAY['ParentID', 'Name', 'NameSuffix', 'Description', 'AutoUpdateDescription', 'BaseView', 'BaseViewGenerated', 'VirtualEntity', 'TrackRecordChanges', 'AuditRecordAccess', 'AuditViewRuns', 'IncludeInAPI', 'AllowAllRowsAPI', 'AllowUpdateAPI', 'AllowCreateAPI', 'AllowDeleteAPI', 'CustomResolverAPI', 'AllowUserSearchAPI', 'FullTextSearchEnabled', 'FullTextCatalog', 'FullTextCatalogGenerated', 'FullTextIndex', 'FullTextIndexGenerated', 'FullTextSearchFunction', 'FullTextSearchFunctionGenerated', 'UserViewMaxRows', 'spCreate', 'spUpdate', 'spDelete', 'spCreateGenerated', 'spUpdateGenerated', 'spDeleteGenerated', 'CascadeDeletes', 'DeleteType', 'AllowRecordMerge', 'spMatch', 'RelationshipDefaultDisplayType', 'UserFormGenerated', 'EntityObjectSubclassName', 'EntityObjectSubclassImport', 'PreferredCommunicationField', 'Icon', 'ScopeDefault', 'RowsToPackWithSchema', 'RowsToPackSampleMethod', 'RowsToPackSampleCount', 'RowsToPackSampleOrder', 'AutoRowCountFrequency', 'RowCount', 'RowCountRunAt', 'Status', 'DisplayName', 'AllowMultipleSubtypes', 'AutoUpdateFullTextSearch', 'AutoUpdateAllowUserSearchAPI', 'TrustServerCacheCompletely', 'SupportsGeoCoding', 'AutoUpdateSupportsGeoCoding', 'AllowCaching', 'DetectExternalChanges', 'GeneratedBaseViewName', 'AllowDirectSQLInsert', 'AllowDirectSQLUpdate', 'AllowDirectSQLDelete', 'Configuration', 'ExternalDataSourceID', 'ExternalObjectName']
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
        WHEN 'ExternalDataSourceID' THEN '($1->>''ExternalDataSourceID'')::UUID'
        WHEN 'ExternalObjectName' THEN '($1->>''ExternalObjectName'')'
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

GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntity" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spUpdateEntity
-- Generated at: 2026-08-20T23:47:34.214Z
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
        "ExternalDataSourceID" = CASE WHEN p_data ? 'ExternalDataSourceID' THEN (p_data->>'ExternalDataSourceID')::UUID ELSE "ExternalDataSourceID" END,
        "ExternalObjectName" = CASE WHEN p_data ? 'ExternalObjectName' THEN (p_data->>'ExternalObjectName') ELSE "ExternalObjectName" END,
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


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntity" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spDeleteEntity
-- Generated at: 2026-08-20T23:47:34.214Z
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

GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntity" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Fields
-- Item: spCreateEntityField
-- Generated at: 2026-08-20T23:47:34.280Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityField"(
    p_id UUID DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_autoupdatedescription BOOLEAN DEFAULT NULL,
    p_isprimarykey BOOLEAN DEFAULT NULL,
    p_isunique BOOLEAN DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(255) DEFAULT NULL,
    p_valuelisttype varchar(20) DEFAULT NULL,
    p_extendedtype_clear boolean DEFAULT false,
    p_extendedtype varchar(50) DEFAULT NULL,
    p_codetype_clear boolean DEFAULT false,
    p_codetype varchar(50) DEFAULT NULL,
    p_defaultinview BOOLEAN DEFAULT NULL,
    p_viewcelltemplate_clear boolean DEFAULT false,
    p_viewcelltemplate TEXT DEFAULT NULL,
    p_defaultcolumnwidth_clear boolean DEFAULT false,
    p_defaultcolumnwidth int DEFAULT NULL,
    p_allowupdateapi BOOLEAN DEFAULT NULL,
    p_allowupdateinview BOOLEAN DEFAULT NULL,
    p_includeinusersearchapi BOOLEAN DEFAULT NULL,
    p_fulltextsearchenabled BOOLEAN DEFAULT NULL,
    p_usersearchparamformatapi_clear boolean DEFAULT false,
    p_usersearchparamformatapi varchar(500) DEFAULT NULL,
    p_includeingeneratedform BOOLEAN DEFAULT NULL,
    p_generatedformsection varchar(10) DEFAULT NULL,
    p_isnamefield BOOLEAN DEFAULT NULL,
    p_relatedentityid_clear boolean DEFAULT false,
    p_relatedentityid UUID DEFAULT NULL,
    p_relatedentityfieldname_clear boolean DEFAULT false,
    p_relatedentityfieldname varchar(255) DEFAULT NULL,
    p_includerelatedentitynamefieldinbaseview BOOLEAN DEFAULT NULL,
    p_relatedentitynamefieldmap_clear boolean DEFAULT false,
    p_relatedentitynamefieldmap varchar(255) DEFAULT NULL,
    p_relatedentitydisplaytype varchar(20) DEFAULT NULL,
    p_entityidfieldname_clear boolean DEFAULT false,
    p_entityidfieldname varchar(100) DEFAULT NULL,
    p_scopedefault_clear boolean DEFAULT false,
    p_scopedefault varchar(100) DEFAULT NULL,
    p_autoupdaterelatedentityinfo BOOLEAN DEFAULT NULL,
    p_valuestopackwithschema varchar(10) DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_autoupdateisnamefield BOOLEAN DEFAULT NULL,
    p_autoupdatedefaultinview BOOLEAN DEFAULT NULL,
    p_autoupdatecategory BOOLEAN DEFAULT NULL,
    p_autoupdatedisplayname BOOLEAN DEFAULT NULL,
    p_autoupdateincludeinusersearchapi BOOLEAN DEFAULT NULL,
    p_encrypt BOOLEAN DEFAULT NULL,
    p_encryptionkeyid_clear boolean DEFAULT false,
    p_encryptionkeyid UUID DEFAULT NULL,
    p_allowdecryptinapi BOOLEAN DEFAULT NULL,
    p_sendencryptedvalue BOOLEAN DEFAULT NULL,
    p_issoftprimarykey BOOLEAN DEFAULT NULL,
    p_issoftforeignkey BOOLEAN DEFAULT NULL,
    p_relatedentityjoinfields_clear boolean DEFAULT false,
    p_relatedentityjoinfields TEXT DEFAULT NULL,
    p_jsontype_clear boolean DEFAULT false,
    p_jsontype varchar(255) DEFAULT NULL,
    p_jsontypeisarray BOOLEAN DEFAULT NULL,
    p_jsontypedefinition_clear boolean DEFAULT false,
    p_jsontypedefinition TEXT DEFAULT NULL,
    p_usersearchpredicateapi varchar(20) DEFAULT NULL,
    p_autoupdateusersearchpredicate BOOLEAN DEFAULT NULL,
    p_autoupdatefulltextsearch BOOLEAN DEFAULT NULL,
    p_autoupdateextendedtype BOOLEAN DEFAULT NULL,
    p_iscomputed BOOLEAN DEFAULT NULL,
    p_embeddedrecord_clear boolean DEFAULT false,
    p_embeddedrecord TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityFields" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityField"
        (
            "ID",
            "DisplayName",
                "Description",
                "AutoUpdateDescription",
                "IsPrimaryKey",
                "IsUnique",
                "Category",
                "ValueListType",
                "ExtendedType",
                "CodeType",
                "DefaultInView",
                "ViewCellTemplate",
                "DefaultColumnWidth",
                "AllowUpdateAPI",
                "AllowUpdateInView",
                "IncludeInUserSearchAPI",
                "FullTextSearchEnabled",
                "UserSearchParamFormatAPI",
                "IncludeInGeneratedForm",
                "GeneratedFormSection",
                "IsNameField",
                "RelatedEntityID",
                "RelatedEntityFieldName",
                "IncludeRelatedEntityNameFieldInBaseView",
                "RelatedEntityNameFieldMap",
                "RelatedEntityDisplayType",
                "EntityIDFieldName",
                "ScopeDefault",
                "AutoUpdateRelatedEntityInfo",
                "ValuesToPackWithSchema",
                "Status",
                "AutoUpdateIsNameField",
                "AutoUpdateDefaultInView",
                "AutoUpdateCategory",
                "AutoUpdateDisplayName",
                "AutoUpdateIncludeInUserSearchAPI",
                "Encrypt",
                "EncryptionKeyID",
                "AllowDecryptInAPI",
                "SendEncryptedValue",
                "IsSoftPrimaryKey",
                "IsSoftForeignKey",
                "RelatedEntityJoinFields",
                "JSONType",
                "JSONTypeIsArray",
                "JSONTypeDefinition",
                "UserSearchPredicateAPI",
                "AutoUpdateUserSearchPredicate",
                "AutoUpdateFullTextSearch",
                "AutoUpdateExtendedType",
                "IsComputed",
                "EmbeddedRecord",
                "Configuration"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_autoupdatedescription, TRUE),
                COALESCE(p_isprimarykey, FALSE),
                COALESCE(p_isunique, FALSE),
                CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, NULL) END,
                COALESCE(p_valuelisttype, 'None'),
                CASE WHEN p_extendedtype_clear = true THEN NULL ELSE COALESCE(p_extendedtype, NULL) END,
                CASE WHEN p_codetype_clear = true THEN NULL ELSE COALESCE(p_codetype, NULL) END,
                COALESCE(p_defaultinview, FALSE),
                CASE WHEN p_viewcelltemplate_clear = true THEN NULL ELSE COALESCE(p_viewcelltemplate, NULL) END,
                CASE WHEN p_defaultcolumnwidth_clear = true THEN NULL ELSE COALESCE(p_defaultcolumnwidth, NULL) END,
                COALESCE(p_allowupdateapi, TRUE),
                COALESCE(p_allowupdateinview, TRUE),
                COALESCE(p_includeinusersearchapi, FALSE),
                COALESCE(p_fulltextsearchenabled, FALSE),
                CASE WHEN p_usersearchparamformatapi_clear = true THEN NULL ELSE COALESCE(p_usersearchparamformatapi, NULL) END,
                COALESCE(p_includeingeneratedform, TRUE),
                COALESCE(p_generatedformsection, 'Details'),
                COALESCE(p_isnamefield, FALSE),
                CASE WHEN p_relatedentityid_clear = true THEN NULL ELSE COALESCE(p_relatedentityid, NULL) END,
                CASE WHEN p_relatedentityfieldname_clear = true THEN NULL ELSE COALESCE(p_relatedentityfieldname, NULL) END,
                COALESCE(p_includerelatedentitynamefieldinbaseview, TRUE),
                CASE WHEN p_relatedentitynamefieldmap_clear = true THEN NULL ELSE COALESCE(p_relatedentitynamefieldmap, NULL) END,
                COALESCE(p_relatedentitydisplaytype, 'Search'),
                CASE WHEN p_entityidfieldname_clear = true THEN NULL ELSE COALESCE(p_entityidfieldname, NULL) END,
                CASE WHEN p_scopedefault_clear = true THEN NULL ELSE COALESCE(p_scopedefault, NULL) END,
                COALESCE(p_autoupdaterelatedentityinfo, TRUE),
                COALESCE(p_valuestopackwithschema, 'Auto'),
                COALESCE(p_status, 'Active'),
                COALESCE(p_autoupdateisnamefield, TRUE),
                COALESCE(p_autoupdatedefaultinview, TRUE),
                COALESCE(p_autoupdatecategory, TRUE),
                COALESCE(p_autoupdatedisplayname, TRUE),
                COALESCE(p_autoupdateincludeinusersearchapi, TRUE),
                COALESCE(p_encrypt, FALSE),
                CASE WHEN p_encryptionkeyid_clear = true THEN NULL ELSE COALESCE(p_encryptionkeyid, NULL) END,
                COALESCE(p_allowdecryptinapi, FALSE),
                COALESCE(p_sendencryptedvalue, FALSE),
                COALESCE(p_issoftprimarykey, FALSE),
                COALESCE(p_issoftforeignkey, FALSE),
                CASE WHEN p_relatedentityjoinfields_clear = true THEN NULL ELSE COALESCE(p_relatedentityjoinfields, NULL) END,
                CASE WHEN p_jsontype_clear = true THEN NULL ELSE COALESCE(p_jsontype, NULL) END,
                COALESCE(p_jsontypeisarray, FALSE),
                CASE WHEN p_jsontypedefinition_clear = true THEN NULL ELSE COALESCE(p_jsontypedefinition, NULL) END,
                COALESCE(p_usersearchpredicateapi, 'Contains'),
                COALESCE(p_autoupdateusersearchpredicate, TRUE),
                COALESCE(p_autoupdatefulltextsearch, TRUE),
                COALESCE(p_autoupdateextendedtype, TRUE),
                COALESCE(p_iscomputed, FALSE),
                CASE WHEN p_embeddedrecord_clear = true THEN NULL ELSE COALESCE(p_embeddedrecord, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityFields"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityField" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityField" TO "cdp_Developer";

GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityField" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityField" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Fields
-- Item: spUpdateEntityField
-- Generated at: 2026-08-20T23:47:34.281Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityField"(
    p_id UUID,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_autoupdatedescription BOOLEAN DEFAULT NULL,
    p_isprimarykey BOOLEAN DEFAULT NULL,
    p_isunique BOOLEAN DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(255) DEFAULT NULL,
    p_valuelisttype varchar(20) DEFAULT NULL,
    p_extendedtype_clear boolean DEFAULT false,
    p_extendedtype varchar(50) DEFAULT NULL,
    p_codetype_clear boolean DEFAULT false,
    p_codetype varchar(50) DEFAULT NULL,
    p_defaultinview BOOLEAN DEFAULT NULL,
    p_viewcelltemplate_clear boolean DEFAULT false,
    p_viewcelltemplate TEXT DEFAULT NULL,
    p_defaultcolumnwidth_clear boolean DEFAULT false,
    p_defaultcolumnwidth int DEFAULT NULL,
    p_allowupdateapi BOOLEAN DEFAULT NULL,
    p_allowupdateinview BOOLEAN DEFAULT NULL,
    p_includeinusersearchapi BOOLEAN DEFAULT NULL,
    p_fulltextsearchenabled BOOLEAN DEFAULT NULL,
    p_usersearchparamformatapi_clear boolean DEFAULT false,
    p_usersearchparamformatapi varchar(500) DEFAULT NULL,
    p_includeingeneratedform BOOLEAN DEFAULT NULL,
    p_generatedformsection varchar(10) DEFAULT NULL,
    p_isnamefield BOOLEAN DEFAULT NULL,
    p_relatedentityid_clear boolean DEFAULT false,
    p_relatedentityid UUID DEFAULT NULL,
    p_relatedentityfieldname_clear boolean DEFAULT false,
    p_relatedentityfieldname varchar(255) DEFAULT NULL,
    p_includerelatedentitynamefieldinbaseview BOOLEAN DEFAULT NULL,
    p_relatedentitynamefieldmap_clear boolean DEFAULT false,
    p_relatedentitynamefieldmap varchar(255) DEFAULT NULL,
    p_relatedentitydisplaytype varchar(20) DEFAULT NULL,
    p_entityidfieldname_clear boolean DEFAULT false,
    p_entityidfieldname varchar(100) DEFAULT NULL,
    p_scopedefault_clear boolean DEFAULT false,
    p_scopedefault varchar(100) DEFAULT NULL,
    p_autoupdaterelatedentityinfo BOOLEAN DEFAULT NULL,
    p_valuestopackwithschema varchar(10) DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_autoupdateisnamefield BOOLEAN DEFAULT NULL,
    p_autoupdatedefaultinview BOOLEAN DEFAULT NULL,
    p_autoupdatecategory BOOLEAN DEFAULT NULL,
    p_autoupdatedisplayname BOOLEAN DEFAULT NULL,
    p_autoupdateincludeinusersearchapi BOOLEAN DEFAULT NULL,
    p_encrypt BOOLEAN DEFAULT NULL,
    p_encryptionkeyid_clear boolean DEFAULT false,
    p_encryptionkeyid UUID DEFAULT NULL,
    p_allowdecryptinapi BOOLEAN DEFAULT NULL,
    p_sendencryptedvalue BOOLEAN DEFAULT NULL,
    p_issoftprimarykey BOOLEAN DEFAULT NULL,
    p_issoftforeignkey BOOLEAN DEFAULT NULL,
    p_relatedentityjoinfields_clear boolean DEFAULT false,
    p_relatedentityjoinfields TEXT DEFAULT NULL,
    p_jsontype_clear boolean DEFAULT false,
    p_jsontype varchar(255) DEFAULT NULL,
    p_jsontypeisarray BOOLEAN DEFAULT NULL,
    p_jsontypedefinition_clear boolean DEFAULT false,
    p_jsontypedefinition TEXT DEFAULT NULL,
    p_usersearchpredicateapi varchar(20) DEFAULT NULL,
    p_autoupdateusersearchpredicate BOOLEAN DEFAULT NULL,
    p_autoupdatefulltextsearch BOOLEAN DEFAULT NULL,
    p_autoupdateextendedtype BOOLEAN DEFAULT NULL,
    p_iscomputed BOOLEAN DEFAULT NULL,
    p_embeddedrecord_clear boolean DEFAULT false,
    p_embeddedrecord TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityFields" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityField"
    SET
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "AutoUpdateDescription" = COALESCE(p_autoupdatedescription, "AutoUpdateDescription"),
        "IsPrimaryKey" = COALESCE(p_isprimarykey, "IsPrimaryKey"),
        "IsUnique" = COALESCE(p_isunique, "IsUnique"),
        "Category" = CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, "Category") END,
        "ValueListType" = COALESCE(p_valuelisttype, "ValueListType"),
        "ExtendedType" = CASE WHEN p_extendedtype_clear = true THEN NULL ELSE COALESCE(p_extendedtype, "ExtendedType") END,
        "CodeType" = CASE WHEN p_codetype_clear = true THEN NULL ELSE COALESCE(p_codetype, "CodeType") END,
        "DefaultInView" = COALESCE(p_defaultinview, "DefaultInView"),
        "ViewCellTemplate" = CASE WHEN p_viewcelltemplate_clear = true THEN NULL ELSE COALESCE(p_viewcelltemplate, "ViewCellTemplate") END,
        "DefaultColumnWidth" = CASE WHEN p_defaultcolumnwidth_clear = true THEN NULL ELSE COALESCE(p_defaultcolumnwidth, "DefaultColumnWidth") END,
        "AllowUpdateAPI" = COALESCE(p_allowupdateapi, "AllowUpdateAPI"),
        "AllowUpdateInView" = COALESCE(p_allowupdateinview, "AllowUpdateInView"),
        "IncludeInUserSearchAPI" = COALESCE(p_includeinusersearchapi, "IncludeInUserSearchAPI"),
        "FullTextSearchEnabled" = COALESCE(p_fulltextsearchenabled, "FullTextSearchEnabled"),
        "UserSearchParamFormatAPI" = CASE WHEN p_usersearchparamformatapi_clear = true THEN NULL ELSE COALESCE(p_usersearchparamformatapi, "UserSearchParamFormatAPI") END,
        "IncludeInGeneratedForm" = COALESCE(p_includeingeneratedform, "IncludeInGeneratedForm"),
        "GeneratedFormSection" = COALESCE(p_generatedformsection, "GeneratedFormSection"),
        "IsNameField" = COALESCE(p_isnamefield, "IsNameField"),
        "RelatedEntityID" = CASE WHEN p_relatedentityid_clear = true THEN NULL ELSE COALESCE(p_relatedentityid, "RelatedEntityID") END,
        "RelatedEntityFieldName" = CASE WHEN p_relatedentityfieldname_clear = true THEN NULL ELSE COALESCE(p_relatedentityfieldname, "RelatedEntityFieldName") END,
        "IncludeRelatedEntityNameFieldInBaseView" = COALESCE(p_includerelatedentitynamefieldinbaseview, "IncludeRelatedEntityNameFieldInBaseView"),
        "RelatedEntityNameFieldMap" = CASE WHEN p_relatedentitynamefieldmap_clear = true THEN NULL ELSE COALESCE(p_relatedentitynamefieldmap, "RelatedEntityNameFieldMap") END,
        "RelatedEntityDisplayType" = COALESCE(p_relatedentitydisplaytype, "RelatedEntityDisplayType"),
        "EntityIDFieldName" = CASE WHEN p_entityidfieldname_clear = true THEN NULL ELSE COALESCE(p_entityidfieldname, "EntityIDFieldName") END,
        "ScopeDefault" = CASE WHEN p_scopedefault_clear = true THEN NULL ELSE COALESCE(p_scopedefault, "ScopeDefault") END,
        "AutoUpdateRelatedEntityInfo" = COALESCE(p_autoupdaterelatedentityinfo, "AutoUpdateRelatedEntityInfo"),
        "ValuesToPackWithSchema" = COALESCE(p_valuestopackwithschema, "ValuesToPackWithSchema"),
        "Status" = COALESCE(p_status, "Status"),
        "AutoUpdateIsNameField" = COALESCE(p_autoupdateisnamefield, "AutoUpdateIsNameField"),
        "AutoUpdateDefaultInView" = COALESCE(p_autoupdatedefaultinview, "AutoUpdateDefaultInView"),
        "AutoUpdateCategory" = COALESCE(p_autoupdatecategory, "AutoUpdateCategory"),
        "AutoUpdateDisplayName" = COALESCE(p_autoupdatedisplayname, "AutoUpdateDisplayName"),
        "AutoUpdateIncludeInUserSearchAPI" = COALESCE(p_autoupdateincludeinusersearchapi, "AutoUpdateIncludeInUserSearchAPI"),
        "Encrypt" = COALESCE(p_encrypt, "Encrypt"),
        "EncryptionKeyID" = CASE WHEN p_encryptionkeyid_clear = true THEN NULL ELSE COALESCE(p_encryptionkeyid, "EncryptionKeyID") END,
        "AllowDecryptInAPI" = COALESCE(p_allowdecryptinapi, "AllowDecryptInAPI"),
        "SendEncryptedValue" = COALESCE(p_sendencryptedvalue, "SendEncryptedValue"),
        "IsSoftPrimaryKey" = COALESCE(p_issoftprimarykey, "IsSoftPrimaryKey"),
        "IsSoftForeignKey" = COALESCE(p_issoftforeignkey, "IsSoftForeignKey"),
        "RelatedEntityJoinFields" = CASE WHEN p_relatedentityjoinfields_clear = true THEN NULL ELSE COALESCE(p_relatedentityjoinfields, "RelatedEntityJoinFields") END,
        "JSONType" = CASE WHEN p_jsontype_clear = true THEN NULL ELSE COALESCE(p_jsontype, "JSONType") END,
        "JSONTypeIsArray" = COALESCE(p_jsontypeisarray, "JSONTypeIsArray"),
        "JSONTypeDefinition" = CASE WHEN p_jsontypedefinition_clear = true THEN NULL ELSE COALESCE(p_jsontypedefinition, "JSONTypeDefinition") END,
        "UserSearchPredicateAPI" = COALESCE(p_usersearchpredicateapi, "UserSearchPredicateAPI"),
        "AutoUpdateUserSearchPredicate" = COALESCE(p_autoupdateusersearchpredicate, "AutoUpdateUserSearchPredicate"),
        "AutoUpdateFullTextSearch" = COALESCE(p_autoupdatefulltextsearch, "AutoUpdateFullTextSearch"),
        "AutoUpdateExtendedType" = COALESCE(p_autoupdateextendedtype, "AutoUpdateExtendedType"),
        "IsComputed" = COALESCE(p_iscomputed, "IsComputed"),
        "EmbeddedRecord" = CASE WHEN p_embeddedrecord_clear = true THEN NULL ELSE COALESCE(p_embeddedrecord, "EmbeddedRecord") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityFields"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityField" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityField" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_field"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_field" ON "__mj"."EntityField";

CREATE TRIGGER "trg_update_entity_field"
BEFORE UPDATE ON "__mj"."EntityField"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_field"();


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityField" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityField" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Fields
-- Item: spDeleteEntityField
-- Generated at: 2026-08-20T23:47:34.281Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityField"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."EntityField"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityField" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityField" TO "cdp_Developer";

GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityField" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityField" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Relationships
-- Item: spCreateEntityRelationship
-- Generated at: 2026-08-20T23:47:34.306Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityRelationship
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityRelationship'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityRelationship"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_relatedentityid UUID DEFAULT NULL,
    p_bundleinapi BOOLEAN DEFAULT NULL,
    p_includeinparentallquery BOOLEAN DEFAULT NULL,
    p_type char(20) DEFAULT NULL,
    p_entitykeyfield_clear boolean DEFAULT false,
    p_entitykeyfield varchar(255) DEFAULT NULL,
    p_relatedentityjoinfield varchar(255) DEFAULT NULL,
    p_joinview_clear boolean DEFAULT false,
    p_joinview varchar(255) DEFAULT NULL,
    p_joinentityjoinfield_clear boolean DEFAULT false,
    p_joinentityjoinfield varchar(255) DEFAULT NULL,
    p_joinentityinversejoinfield_clear boolean DEFAULT false,
    p_joinentityinversejoinfield varchar(255) DEFAULT NULL,
    p_displayinform BOOLEAN DEFAULT NULL,
    p_displaylocation varchar(50) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_displayicontype varchar(50) DEFAULT NULL,
    p_displayicon_clear boolean DEFAULT false,
    p_displayicon varchar(255) DEFAULT NULL,
    p_displaycomponentid_clear boolean DEFAULT false,
    p_displaycomponentid UUID DEFAULT NULL,
    p_displaycomponentconfiguration_clear boolean DEFAULT false,
    p_displaycomponentconfiguration TEXT DEFAULT NULL,
    p_autoupdatefromschema BOOLEAN DEFAULT NULL,
    p_additionalfieldstoinclude_clear boolean DEFAULT false,
    p_additionalfieldstoinclude TEXT DEFAULT NULL,
    p_autoupdateadditionalfieldstoinclude BOOLEAN DEFAULT NULL,
    p_relatedrecordcollection_clear boolean DEFAULT false,
    p_relatedrecordcollection text DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityRelationships" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityRelationship"
        (
            "ID",
            "EntityID",
                "Sequence",
                "RelatedEntityID",
                "BundleInAPI",
                "IncludeInParentAllQuery",
                "Type",
                "EntityKeyField",
                "RelatedEntityJoinField",
                "JoinView",
                "JoinEntityJoinField",
                "JoinEntityInverseJoinField",
                "DisplayInForm",
                "DisplayLocation",
                "DisplayName",
                "DisplayIconType",
                "DisplayIcon",
                "DisplayComponentID",
                "DisplayComponentConfiguration",
                "AutoUpdateFromSchema",
                "AdditionalFieldsToInclude",
                "AutoUpdateAdditionalFieldsToInclude",
                "RelatedRecordCollection",
                "Configuration"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                COALESCE(p_sequence, 0),
                p_relatedentityid,
                COALESCE(p_bundleinapi, TRUE),
                COALESCE(p_includeinparentallquery, FALSE),
                COALESCE(p_type, 'One To Many'),
                CASE WHEN p_entitykeyfield_clear = true THEN NULL ELSE COALESCE(p_entitykeyfield, NULL) END,
                p_relatedentityjoinfield,
                CASE WHEN p_joinview_clear = true THEN NULL ELSE COALESCE(p_joinview, NULL) END,
                CASE WHEN p_joinentityjoinfield_clear = true THEN NULL ELSE COALESCE(p_joinentityjoinfield, NULL) END,
                CASE WHEN p_joinentityinversejoinfield_clear = true THEN NULL ELSE COALESCE(p_joinentityinversejoinfield, NULL) END,
                COALESCE(p_displayinform, TRUE),
                COALESCE(p_displaylocation, 'After Field Tabs'),
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                COALESCE(p_displayicontype, 'Related Entity Icon'),
                CASE WHEN p_displayicon_clear = true THEN NULL ELSE COALESCE(p_displayicon, NULL) END,
                CASE WHEN p_displaycomponentid_clear = true THEN NULL ELSE COALESCE(p_displaycomponentid, NULL) END,
                CASE WHEN p_displaycomponentconfiguration_clear = true THEN NULL ELSE COALESCE(p_displaycomponentconfiguration, NULL) END,
                COALESCE(p_autoupdatefromschema, TRUE),
                CASE WHEN p_additionalfieldstoinclude_clear = true THEN NULL ELSE COALESCE(p_additionalfieldstoinclude, NULL) END,
                COALESCE(p_autoupdateadditionalfieldstoinclude, TRUE),
                CASE WHEN p_relatedrecordcollection_clear = true THEN NULL ELSE COALESCE(p_relatedrecordcollection, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityRelationships"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityRelationship" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityRelationship" TO "cdp_Developer";

GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityRelationship" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityRelationship" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Relationships
-- Item: spUpdateEntityRelationship
-- Generated at: 2026-08-20T23:47:34.306Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityRelationship
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityRelationship'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityRelationship"(
    p_id UUID,
    p_entityid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_relatedentityid UUID DEFAULT NULL,
    p_bundleinapi BOOLEAN DEFAULT NULL,
    p_includeinparentallquery BOOLEAN DEFAULT NULL,
    p_type char(20) DEFAULT NULL,
    p_entitykeyfield_clear boolean DEFAULT false,
    p_entitykeyfield varchar(255) DEFAULT NULL,
    p_relatedentityjoinfield varchar(255) DEFAULT NULL,
    p_joinview_clear boolean DEFAULT false,
    p_joinview varchar(255) DEFAULT NULL,
    p_joinentityjoinfield_clear boolean DEFAULT false,
    p_joinentityjoinfield varchar(255) DEFAULT NULL,
    p_joinentityinversejoinfield_clear boolean DEFAULT false,
    p_joinentityinversejoinfield varchar(255) DEFAULT NULL,
    p_displayinform BOOLEAN DEFAULT NULL,
    p_displaylocation varchar(50) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_displayicontype varchar(50) DEFAULT NULL,
    p_displayicon_clear boolean DEFAULT false,
    p_displayicon varchar(255) DEFAULT NULL,
    p_displaycomponentid_clear boolean DEFAULT false,
    p_displaycomponentid UUID DEFAULT NULL,
    p_displaycomponentconfiguration_clear boolean DEFAULT false,
    p_displaycomponentconfiguration TEXT DEFAULT NULL,
    p_autoupdatefromschema BOOLEAN DEFAULT NULL,
    p_additionalfieldstoinclude_clear boolean DEFAULT false,
    p_additionalfieldstoinclude TEXT DEFAULT NULL,
    p_autoupdateadditionalfieldstoinclude BOOLEAN DEFAULT NULL,
    p_relatedrecordcollection_clear boolean DEFAULT false,
    p_relatedrecordcollection text DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityRelationships" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityRelationship"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "RelatedEntityID" = COALESCE(p_relatedentityid, "RelatedEntityID"),
        "BundleInAPI" = COALESCE(p_bundleinapi, "BundleInAPI"),
        "IncludeInParentAllQuery" = COALESCE(p_includeinparentallquery, "IncludeInParentAllQuery"),
        "Type" = COALESCE(p_type, "Type"),
        "EntityKeyField" = CASE WHEN p_entitykeyfield_clear = true THEN NULL ELSE COALESCE(p_entitykeyfield, "EntityKeyField") END,
        "RelatedEntityJoinField" = COALESCE(p_relatedentityjoinfield, "RelatedEntityJoinField"),
        "JoinView" = CASE WHEN p_joinview_clear = true THEN NULL ELSE COALESCE(p_joinview, "JoinView") END,
        "JoinEntityJoinField" = CASE WHEN p_joinentityjoinfield_clear = true THEN NULL ELSE COALESCE(p_joinentityjoinfield, "JoinEntityJoinField") END,
        "JoinEntityInverseJoinField" = CASE WHEN p_joinentityinversejoinfield_clear = true THEN NULL ELSE COALESCE(p_joinentityinversejoinfield, "JoinEntityInverseJoinField") END,
        "DisplayInForm" = COALESCE(p_displayinform, "DisplayInForm"),
        "DisplayLocation" = COALESCE(p_displaylocation, "DisplayLocation"),
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "DisplayIconType" = COALESCE(p_displayicontype, "DisplayIconType"),
        "DisplayIcon" = CASE WHEN p_displayicon_clear = true THEN NULL ELSE COALESCE(p_displayicon, "DisplayIcon") END,
        "DisplayComponentID" = CASE WHEN p_displaycomponentid_clear = true THEN NULL ELSE COALESCE(p_displaycomponentid, "DisplayComponentID") END,
        "DisplayComponentConfiguration" = CASE WHEN p_displaycomponentconfiguration_clear = true THEN NULL ELSE COALESCE(p_displaycomponentconfiguration, "DisplayComponentConfiguration") END,
        "AutoUpdateFromSchema" = COALESCE(p_autoupdatefromschema, "AutoUpdateFromSchema"),
        "AdditionalFieldsToInclude" = CASE WHEN p_additionalfieldstoinclude_clear = true THEN NULL ELSE COALESCE(p_additionalfieldstoinclude, "AdditionalFieldsToInclude") END,
        "AutoUpdateAdditionalFieldsToInclude" = COALESCE(p_autoupdateadditionalfieldstoinclude, "AutoUpdateAdditionalFieldsToInclude"),
        "RelatedRecordCollection" = CASE WHEN p_relatedrecordcollection_clear = true THEN NULL ELSE COALESCE(p_relatedrecordcollection, "RelatedRecordCollection") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityRelationships"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityRelationship" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityRelationship" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityRelationship table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_relationship"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_relationship" ON "__mj"."EntityRelationship";

CREATE TRIGGER "trg_update_entity_relationship"
BEFORE UPDATE ON "__mj"."EntityRelationship"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_relationship"();


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityRelationship" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityRelationship" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Relationships
-- Item: spDeleteEntityRelationship
-- Generated at: 2026-08-20T23:47:34.306Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityRelationship
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityRelationship'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityRelationship"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."EntityRelationship"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityRelationship" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityRelationship" TO "cdp_Developer";

GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityRelationship" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityRelationship" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: File Storage Providers
-- Item: vwFileStorageProviders
-- Generated at: 2026-08-20T23:47:34.362Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: File Storage Providers
-----               SCHEMA:      __mj
-----               BASE TABLE:  FileStorageProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwFileStorageProviders"
AS
SELECT
    f.*
FROM
    "__mj"."FileStorageProvider" AS f
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwFileStorageProviders'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwFileStorageProviders'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwFileStorageProviders'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwFileStorageProviders" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwFileStorageProviders" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwFileStorageProviders" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwFileStorageProviders" TO "cdp_Developer";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: File Storage Providers
-- Item: Permissions for vwFileStorageProviders
-- Generated at: 2026-08-20T23:47:34.363Z
-- ============================================================
GRANT SELECT ON "__mj"."vwFileStorageProviders" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwFileStorageProviders" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwFileStorageProviders" TO "cdp_Developer";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: File Storage Providers
-- Item: spCreateFileStorageProvider
-- Generated at: 2026-08-20T23:47:34.363Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR FileStorageProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateFileStorageProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateFileStorageProvider"(
    p_id UUID DEFAULT NULL,
    p_name varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_serverdriverkey varchar(100) DEFAULT NULL,
    p_clientdriverkey varchar(100) DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_supportssearch BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_requiresoauth BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwFileStorageProviders" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."FileStorageProvider"
        (
            "ID",
            "Name",
                "Description",
                "ServerDriverKey",
                "ClientDriverKey",
                "Priority",
                "IsActive",
                "SupportsSearch",
                "Configuration",
                "RequiresOAuth"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_serverdriverkey,
                p_clientdriverkey,
                COALESCE(p_priority, 0),
                COALESCE(p_isactive, TRUE),
                COALESCE(p_supportssearch, FALSE),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                COALESCE(p_requiresoauth, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwFileStorageProviders"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFileStorageProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFileStorageProvider" TO "cdp_Developer";

GRANT EXECUTE ON FUNCTION "__mj"."spCreateFileStorageProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFileStorageProvider" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: File Storage Providers
-- Item: spUpdateFileStorageProvider
-- Generated at: 2026-08-20T23:47:34.363Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR FileStorageProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateFileStorageProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateFileStorageProvider"(
    p_id UUID,
    p_name varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_serverdriverkey varchar(100) DEFAULT NULL,
    p_clientdriverkey varchar(100) DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_supportssearch BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_requiresoauth BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwFileStorageProviders" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."FileStorageProvider"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ServerDriverKey" = COALESCE(p_serverdriverkey, "ServerDriverKey"),
        "ClientDriverKey" = COALESCE(p_clientdriverkey, "ClientDriverKey"),
        "Priority" = COALESCE(p_priority, "Priority"),
        "IsActive" = COALESCE(p_isactive, "IsActive"),
        "SupportsSearch" = COALESCE(p_supportssearch, "SupportsSearch"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "RequiresOAuth" = COALESCE(p_requiresoauth, "RequiresOAuth")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwFileStorageProviders"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFileStorageProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFileStorageProvider" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FileStorageProvider table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_file_storage_provider"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_file_storage_provider" ON "__mj"."FileStorageProvider";

CREATE TRIGGER "trg_update_file_storage_provider"
BEFORE UPDATE ON "__mj"."FileStorageProvider"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_file_storage_provider"();


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFileStorageProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFileStorageProvider" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: File Storage Providers
-- Item: spDeleteFileStorageProvider
-- Generated at: 2026-08-20T23:47:34.363Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR FileStorageProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteFileStorageProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteFileStorageProvider"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."FileStorageProvider"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFileStorageProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFileStorageProvider" TO "cdp_Developer";

GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFileStorageProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFileStorageProvider" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Form Chrome Rules
-- Item: vwFormChromeRules
-- Generated at: 2026-08-20T23:47:34.369Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Form Chrome Rules
-----               SCHEMA:      __mj
-----               BASE TABLE:  FormChromeRule
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwFormChromeRules"
AS
SELECT
    f.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJEntity_RelatedEntityID."Name" AS "RelatedEntity"
FROM
    "__mj"."FormChromeRule" AS f
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "f"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_RelatedEntityID
  ON
    "f"."RelatedEntityID" = MJEntity_RelatedEntityID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwFormChromeRules'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwFormChromeRules'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwFormChromeRules'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwFormChromeRules" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwFormChromeRules" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwFormChromeRules" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwFormChromeRules" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Form Chrome Rules
-- Item: Permissions for vwFormChromeRules
-- Generated at: 2026-08-20T23:47:34.371Z
-- ============================================================
GRANT SELECT ON "__mj"."vwFormChromeRules" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwFormChromeRules" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwFormChromeRules" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Form Chrome Rules
-- Item: spCreateFormChromeRule
-- Generated at: 2026-08-20T23:47:34.371Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR FormChromeRule
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateFormChromeRule'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateFormChromeRule"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_targetkind varchar(20) DEFAULT NULL,
    p_relatedentityid_clear boolean DEFAULT false,
    p_relatedentityid UUID DEFAULT NULL,
    p_contributionkey_clear boolean DEFAULT false,
    p_contributionkey varchar(256) DEFAULT NULL,
    p_inclusion varchar(20) DEFAULT NULL,
    p_joinfields_clear boolean DEFAULT false,
    p_joinfields TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_title_clear boolean DEFAULT false,
    p_title varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwFormChromeRules" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."FormChromeRule"
        (
            "ID",
            "EntityID",
                "TargetKind",
                "RelatedEntityID",
                "ContributionKey",
                "Inclusion",
                "JoinFields",
                "Sequence",
                "Title"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_targetkind,
                CASE WHEN p_relatedentityid_clear = true THEN NULL ELSE COALESCE(p_relatedentityid, NULL) END,
                CASE WHEN p_contributionkey_clear = true THEN NULL ELSE COALESCE(p_contributionkey, NULL) END,
                p_inclusion,
                CASE WHEN p_joinfields_clear = true THEN NULL ELSE COALESCE(p_joinfields, NULL) END,
                COALESCE(p_sequence, 0),
                CASE WHEN p_title_clear = true THEN NULL ELSE COALESCE(p_title, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwFormChromeRules"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFormChromeRule" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFormChromeRule" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spCreateFormChromeRule" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFormChromeRule" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Form Chrome Rules
-- Item: spUpdateFormChromeRule
-- Generated at: 2026-08-20T23:47:34.371Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR FormChromeRule
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateFormChromeRule'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateFormChromeRule"(
    p_id UUID,
    p_entityid UUID DEFAULT NULL,
    p_targetkind varchar(20) DEFAULT NULL,
    p_relatedentityid_clear boolean DEFAULT false,
    p_relatedentityid UUID DEFAULT NULL,
    p_contributionkey_clear boolean DEFAULT false,
    p_contributionkey varchar(256) DEFAULT NULL,
    p_inclusion varchar(20) DEFAULT NULL,
    p_joinfields_clear boolean DEFAULT false,
    p_joinfields TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_title_clear boolean DEFAULT false,
    p_title varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwFormChromeRules" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."FormChromeRule"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "TargetKind" = COALESCE(p_targetkind, "TargetKind"),
        "RelatedEntityID" = CASE WHEN p_relatedentityid_clear = true THEN NULL ELSE COALESCE(p_relatedentityid, "RelatedEntityID") END,
        "ContributionKey" = CASE WHEN p_contributionkey_clear = true THEN NULL ELSE COALESCE(p_contributionkey, "ContributionKey") END,
        "Inclusion" = COALESCE(p_inclusion, "Inclusion"),
        "JoinFields" = CASE WHEN p_joinfields_clear = true THEN NULL ELSE COALESCE(p_joinfields, "JoinFields") END,
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Title" = CASE WHEN p_title_clear = true THEN NULL ELSE COALESCE(p_title, "Title") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwFormChromeRules"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFormChromeRule" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFormChromeRule" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormChromeRule table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_form_chrome_rule"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_form_chrome_rule" ON "__mj"."FormChromeRule";

CREATE TRIGGER "trg_update_form_chrome_rule"
BEFORE UPDATE ON "__mj"."FormChromeRule"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_form_chrome_rule"();


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFormChromeRule" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFormChromeRule" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Form Chrome Rules
-- Item: spDeleteFormChromeRule
-- Generated at: 2026-08-20T23:47:34.371Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR FormChromeRule
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteFormChromeRule'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteFormChromeRule"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."FormChromeRule"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFormChromeRule" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFormChromeRule" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFormChromeRule" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFormChromeRule" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Materialized Results
-- Item: vwMaterializedResults
-- Generated at: 2026-08-20T23:47:34.473Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Materialized Results
-----               SCHEMA:      __mj
-----               BASE TABLE:  MaterializedResult
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMaterializedResults"
AS
SELECT
    m.*,
    MJEntity_SourceEntityID."Name" AS "SourceEntity",
    MJEntity_GeneratedEntityID."Name" AS "GeneratedEntity"
FROM
    "__mj"."MaterializedResult" AS m
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_SourceEntityID
  ON
    "m"."SourceEntityID" = MJEntity_SourceEntityID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_GeneratedEntityID
  ON
    "m"."GeneratedEntityID" = MJEntity_GeneratedEntityID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMaterializedResults'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMaterializedResults'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMaterializedResults'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwMaterializedResults" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwMaterializedResults" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMaterializedResults" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMaterializedResults" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Materialized Results
-- Item: Permissions for vwMaterializedResults
-- Generated at: 2026-08-20T23:47:34.475Z
-- ============================================================
GRANT SELECT ON "__mj"."vwMaterializedResults" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMaterializedResults" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMaterializedResults" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Materialized Results
-- Item: spCreateMaterializedResult
-- Generated at: 2026-08-20T23:47:34.475Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MaterializedResult
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMaterializedResult'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMaterializedResult"(
    p_id UUID DEFAULT NULL,
    p_sourcetype varchar(20) DEFAULT NULL,
    p_sourceentityid_clear boolean DEFAULT false,
    p_sourceentityid UUID DEFAULT NULL,
    p_generatedentityid_clear boolean DEFAULT false,
    p_generatedentityid UUID DEFAULT NULL,
    p_schemaname varchar(255) DEFAULT NULL,
    p_tablename varchar(255) DEFAULT NULL,
    p_viewname varchar(255) DEFAULT NULL,
    p_parammode varchar(20) DEFAULT NULL,
    p_refreshstrategy varchar(30) DEFAULT NULL,
    p_refreshschedule_clear boolean DEFAULT false,
    p_refreshschedule varchar(255) DEFAULT NULL,
    p_lastrefreshedat_clear boolean DEFAULT false,
    p_lastrefreshedat TIMESTAMPTZ DEFAULT NULL,
    p_nextrefreshat_clear boolean DEFAULT false,
    p_nextrefreshat TIMESTAMPTZ DEFAULT NULL,
    p_watermark_clear boolean DEFAULT false,
    p_watermark TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_rowcount_clear boolean DEFAULT false,
    p_rowcount bigint DEFAULT NULL,
    p_approxbuildcostms_clear boolean DEFAULT false,
    p_approxbuildcostms bigint DEFAULT NULL,
    p_intendedworkload_clear boolean DEFAULT false,
    p_intendedworkload TEXT DEFAULT NULL,
    p_rowfiltercolumns_clear boolean DEFAULT false,
    p_rowfiltercolumns TEXT DEFAULT NULL,
    p_broadsql_clear boolean DEFAULT false,
    p_broadsql TEXT DEFAULT NULL,
    p_keycolumns_clear boolean DEFAULT false,
    p_keycolumns TEXT DEFAULT NULL,
    p_sourcerowcount_clear boolean DEFAULT false,
    p_sourcerowcount bigint DEFAULT NULL,
    p_refreshessincefullrebuild int DEFAULT NULL,
    p_readfilterspec_clear boolean DEFAULT false,
    p_readfilterspec TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwMaterializedResults" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MaterializedResult"
        (
            "ID",
            "SourceType",
                "SourceEntityID",
                "GeneratedEntityID",
                "SchemaName",
                "TableName",
                "ViewName",
                "ParamMode",
                "RefreshStrategy",
                "RefreshSchedule",
                "LastRefreshedAt",
                "NextRefreshAt",
                "Watermark",
                "Status",
                "RowCount",
                "ApproxBuildCostMs",
                "IntendedWorkload",
                "RowFilterColumns",
                "BroadSQL",
                "KeyColumns",
                "SourceRowCount",
                "RefreshesSinceFullRebuild",
                "ReadFilterSpec"
        )
    VALUES
        (
            v_new_id,
            p_sourcetype,
                CASE WHEN p_sourceentityid_clear = true THEN NULL ELSE COALESCE(p_sourceentityid, NULL) END,
                CASE WHEN p_generatedentityid_clear = true THEN NULL ELSE COALESCE(p_generatedentityid, NULL) END,
                p_schemaname,
                p_tablename,
                p_viewname,
                COALESCE(p_parammode, 'None'),
                COALESCE(p_refreshstrategy, 'FullRebuild'),
                CASE WHEN p_refreshschedule_clear = true THEN NULL ELSE COALESCE(p_refreshschedule, NULL) END,
                CASE WHEN p_lastrefreshedat_clear = true THEN NULL ELSE COALESCE(p_lastrefreshedat, NULL) END,
                CASE WHEN p_nextrefreshat_clear = true THEN NULL ELSE COALESCE(p_nextrefreshat, NULL) END,
                CASE WHEN p_watermark_clear = true THEN NULL ELSE COALESCE(p_watermark, NULL) END,
                COALESCE(p_status, 'Building'),
                CASE WHEN p_rowcount_clear = true THEN NULL ELSE COALESCE(p_rowcount, NULL) END,
                CASE WHEN p_approxbuildcostms_clear = true THEN NULL ELSE COALESCE(p_approxbuildcostms, NULL) END,
                CASE WHEN p_intendedworkload_clear = true THEN NULL ELSE COALESCE(p_intendedworkload, NULL) END,
                CASE WHEN p_rowfiltercolumns_clear = true THEN NULL ELSE COALESCE(p_rowfiltercolumns, NULL) END,
                CASE WHEN p_broadsql_clear = true THEN NULL ELSE COALESCE(p_broadsql, NULL) END,
                CASE WHEN p_keycolumns_clear = true THEN NULL ELSE COALESCE(p_keycolumns, NULL) END,
                CASE WHEN p_sourcerowcount_clear = true THEN NULL ELSE COALESCE(p_sourcerowcount, NULL) END,
                COALESCE(p_refreshessincefullrebuild, 0),
                CASE WHEN p_readfilterspec_clear = true THEN NULL ELSE COALESCE(p_readfilterspec, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMaterializedResults"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMaterializedResult" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMaterializedResult" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spCreateMaterializedResult" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMaterializedResult" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Materialized Results
-- Item: spUpdateMaterializedResult
-- Generated at: 2026-08-20T23:47:34.475Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MaterializedResult
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMaterializedResult'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMaterializedResult"(
    p_id UUID,
    p_sourcetype varchar(20) DEFAULT NULL,
    p_sourceentityid_clear boolean DEFAULT false,
    p_sourceentityid UUID DEFAULT NULL,
    p_generatedentityid_clear boolean DEFAULT false,
    p_generatedentityid UUID DEFAULT NULL,
    p_schemaname varchar(255) DEFAULT NULL,
    p_tablename varchar(255) DEFAULT NULL,
    p_viewname varchar(255) DEFAULT NULL,
    p_parammode varchar(20) DEFAULT NULL,
    p_refreshstrategy varchar(30) DEFAULT NULL,
    p_refreshschedule_clear boolean DEFAULT false,
    p_refreshschedule varchar(255) DEFAULT NULL,
    p_lastrefreshedat_clear boolean DEFAULT false,
    p_lastrefreshedat TIMESTAMPTZ DEFAULT NULL,
    p_nextrefreshat_clear boolean DEFAULT false,
    p_nextrefreshat TIMESTAMPTZ DEFAULT NULL,
    p_watermark_clear boolean DEFAULT false,
    p_watermark TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_rowcount_clear boolean DEFAULT false,
    p_rowcount bigint DEFAULT NULL,
    p_approxbuildcostms_clear boolean DEFAULT false,
    p_approxbuildcostms bigint DEFAULT NULL,
    p_intendedworkload_clear boolean DEFAULT false,
    p_intendedworkload TEXT DEFAULT NULL,
    p_rowfiltercolumns_clear boolean DEFAULT false,
    p_rowfiltercolumns TEXT DEFAULT NULL,
    p_broadsql_clear boolean DEFAULT false,
    p_broadsql TEXT DEFAULT NULL,
    p_keycolumns_clear boolean DEFAULT false,
    p_keycolumns TEXT DEFAULT NULL,
    p_sourcerowcount_clear boolean DEFAULT false,
    p_sourcerowcount bigint DEFAULT NULL,
    p_refreshessincefullrebuild int DEFAULT NULL,
    p_readfilterspec_clear boolean DEFAULT false,
    p_readfilterspec TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwMaterializedResults" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MaterializedResult"
    SET
        "SourceType" = COALESCE(p_sourcetype, "SourceType"),
        "SourceEntityID" = CASE WHEN p_sourceentityid_clear = true THEN NULL ELSE COALESCE(p_sourceentityid, "SourceEntityID") END,
        "GeneratedEntityID" = CASE WHEN p_generatedentityid_clear = true THEN NULL ELSE COALESCE(p_generatedentityid, "GeneratedEntityID") END,
        "SchemaName" = COALESCE(p_schemaname, "SchemaName"),
        "TableName" = COALESCE(p_tablename, "TableName"),
        "ViewName" = COALESCE(p_viewname, "ViewName"),
        "ParamMode" = COALESCE(p_parammode, "ParamMode"),
        "RefreshStrategy" = COALESCE(p_refreshstrategy, "RefreshStrategy"),
        "RefreshSchedule" = CASE WHEN p_refreshschedule_clear = true THEN NULL ELSE COALESCE(p_refreshschedule, "RefreshSchedule") END,
        "LastRefreshedAt" = CASE WHEN p_lastrefreshedat_clear = true THEN NULL ELSE COALESCE(p_lastrefreshedat, "LastRefreshedAt") END,
        "NextRefreshAt" = CASE WHEN p_nextrefreshat_clear = true THEN NULL ELSE COALESCE(p_nextrefreshat, "NextRefreshAt") END,
        "Watermark" = CASE WHEN p_watermark_clear = true THEN NULL ELSE COALESCE(p_watermark, "Watermark") END,
        "Status" = COALESCE(p_status, "Status"),
        "RowCount" = CASE WHEN p_rowcount_clear = true THEN NULL ELSE COALESCE(p_rowcount, "RowCount") END,
        "ApproxBuildCostMs" = CASE WHEN p_approxbuildcostms_clear = true THEN NULL ELSE COALESCE(p_approxbuildcostms, "ApproxBuildCostMs") END,
        "IntendedWorkload" = CASE WHEN p_intendedworkload_clear = true THEN NULL ELSE COALESCE(p_intendedworkload, "IntendedWorkload") END,
        "RowFilterColumns" = CASE WHEN p_rowfiltercolumns_clear = true THEN NULL ELSE COALESCE(p_rowfiltercolumns, "RowFilterColumns") END,
        "BroadSQL" = CASE WHEN p_broadsql_clear = true THEN NULL ELSE COALESCE(p_broadsql, "BroadSQL") END,
        "KeyColumns" = CASE WHEN p_keycolumns_clear = true THEN NULL ELSE COALESCE(p_keycolumns, "KeyColumns") END,
        "SourceRowCount" = CASE WHEN p_sourcerowcount_clear = true THEN NULL ELSE COALESCE(p_sourcerowcount, "SourceRowCount") END,
        "RefreshesSinceFullRebuild" = COALESCE(p_refreshessincefullrebuild, "RefreshesSinceFullRebuild"),
        "ReadFilterSpec" = CASE WHEN p_readfilterspec_clear = true THEN NULL ELSE COALESCE(p_readfilterspec, "ReadFilterSpec") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMaterializedResults"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMaterializedResult" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMaterializedResult" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MaterializedResult table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_materialized_result"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_materialized_result" ON "__mj"."MaterializedResult";

CREATE TRIGGER "trg_update_materialized_result"
BEFORE UPDATE ON "__mj"."MaterializedResult"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_materialized_result"();


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMaterializedResult" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMaterializedResult" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Materialized Results
-- Item: spDeleteMaterializedResult
-- Generated at: 2026-08-20T23:47:34.475Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MaterializedResult
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMaterializedResult'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMaterializedResult"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MaterializedResult"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMaterializedResult" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMaterializedResult" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMaterializedResult" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMaterializedResult" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Materialized Result Queries
-- Item: vwMaterializedResultQueries
-- Generated at: 2026-08-20T23:47:34.469Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Materialized Result Queries
-----               SCHEMA:      __mj
-----               BASE TABLE:  MaterializedResultQuery
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMaterializedResultQueries"
AS
SELECT
    m.*,
    MJQuery_QueryID."Name" AS "Query"
FROM
    "__mj"."MaterializedResultQuery" AS m
INNER JOIN
    "__mj"."Query" AS MJQuery_QueryID
  ON
    "m"."QueryID" = MJQuery_QueryID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMaterializedResultQueries'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMaterializedResultQueries'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMaterializedResultQueries'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwMaterializedResultQueries" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwMaterializedResultQueries" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMaterializedResultQueries" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMaterializedResultQueries" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Materialized Result Queries
-- Item: Permissions for vwMaterializedResultQueries
-- Generated at: 2026-08-20T23:47:34.470Z
-- ============================================================
GRANT SELECT ON "__mj"."vwMaterializedResultQueries" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMaterializedResultQueries" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMaterializedResultQueries" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Materialized Result Queries
-- Item: spCreateMaterializedResultQuery
-- Generated at: 2026-08-20T23:47:34.470Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MaterializedResultQuery
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMaterializedResultQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMaterializedResultQuery"(
    p_id UUID DEFAULT NULL,
    p_materializedresultid UUID DEFAULT NULL,
    p_queryid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwMaterializedResultQueries" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MaterializedResultQuery"
        (
            "ID",
            "MaterializedResultID",
                "QueryID"
        )
    VALUES
        (
            v_new_id,
            p_materializedresultid,
                p_queryid
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMaterializedResultQueries"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMaterializedResultQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMaterializedResultQuery" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spCreateMaterializedResultQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMaterializedResultQuery" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Materialized Result Queries
-- Item: spUpdateMaterializedResultQuery
-- Generated at: 2026-08-20T23:47:34.470Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MaterializedResultQuery
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMaterializedResultQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMaterializedResultQuery"(
    p_id UUID,
    p_materializedresultid UUID DEFAULT NULL,
    p_queryid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwMaterializedResultQueries" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MaterializedResultQuery"
    SET
        "MaterializedResultID" = COALESCE(p_materializedresultid, "MaterializedResultID"),
        "QueryID" = COALESCE(p_queryid, "QueryID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMaterializedResultQueries"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMaterializedResultQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMaterializedResultQuery" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MaterializedResultQuery table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_materialized_result_query"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_materialized_result_query" ON "__mj"."MaterializedResultQuery";

CREATE TRIGGER "trg_update_materialized_result_query"
BEFORE UPDATE ON "__mj"."MaterializedResultQuery"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_materialized_result_query"();


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMaterializedResultQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMaterializedResultQuery" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Materialized Result Queries
-- Item: spDeleteMaterializedResultQuery
-- Generated at: 2026-08-20T23:47:34.471Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MaterializedResultQuery
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMaterializedResultQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMaterializedResultQuery"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MaterializedResultQuery"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMaterializedResultQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMaterializedResultQuery" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMaterializedResultQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMaterializedResultQuery" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: vwQueries
-- Generated at: 2026-08-20T23:47:34.622Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Queries
-----               SCHEMA:      __mj
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwQueries"
AS
SELECT
    q.*,
    MJQueryCategory_CategoryID."Name" AS "Category",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJSQLDialect_SQLDialectID."Name" AS "SQLDialect",
    MJExternalDataSource_ExternalDataSourceID."Name" AS "ExternalDataSource"
FROM
    "__mj"."Query" AS q
LEFT OUTER JOIN
    "__mj"."QueryCategory" AS MJQueryCategory_CategoryID
  ON
    "q"."CategoryID" = MJQueryCategory_CategoryID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "q"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
INNER JOIN
    "__mj"."SQLDialect" AS MJSQLDialect_SQLDialectID
  ON
    "q"."SQLDialectID" = MJSQLDialect_SQLDialectID."ID"
LEFT OUTER JOIN
    "__mj"."ExternalDataSource" AS MJExternalDataSource_ExternalDataSourceID
  ON
    "q"."ExternalDataSourceID" = MJExternalDataSource_ExternalDataSourceID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwQueries'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwQueries'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwQueries'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwQueries" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: Permissions for vwQueries
-- Generated at: 2026-08-20T23:47:34.623Z
-- ============================================================
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spCreateQuery
-- Generated at: 2026-08-20T23:47:34.623Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateQuery"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_userquestion_clear boolean DEFAULT false,
    p_userquestion TEXT DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sql_clear boolean DEFAULT false,
    p_sql TEXT DEFAULT NULL,
    p_technicaldescription_clear boolean DEFAULT false,
    p_technicaldescription TEXT DEFAULT NULL,
    p_originalsql_clear boolean DEFAULT false,
    p_originalsql TEXT DEFAULT NULL,
    p_feedback_clear boolean DEFAULT false,
    p_feedback TEXT DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_qualityrank_clear boolean DEFAULT false,
    p_qualityrank int DEFAULT NULL,
    p_executioncostrank_clear boolean DEFAULT false,
    p_executioncostrank int DEFAULT NULL,
    p_usestemplate_clear boolean DEFAULT false,
    p_usestemplate BOOLEAN DEFAULT NULL,
    p_auditqueryruns BOOLEAN DEFAULT NULL,
    p_cacheenabled BOOLEAN DEFAULT NULL,
    p_cachettlminutes_clear boolean DEFAULT false,
    p_cachettlminutes int DEFAULT NULL,
    p_cachemaxsize_clear boolean DEFAULT false,
    p_cachemaxsize int DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_cachevalidationsql_clear boolean DEFAULT false,
    p_cachevalidationsql TEXT DEFAULT NULL,
    p_sqldialectid UUID DEFAULT NULL,
    p_reusable BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_ismaterialized BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueries" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Query"
        (
            "ID",
            "Name",
                "CategoryID",
                "UserQuestion",
                "Description",
                "SQL",
                "TechnicalDescription",
                "OriginalSQL",
                "Feedback",
                "Status",
                "QualityRank",
                "ExecutionCostRank",
                "UsesTemplate",
                "AuditQueryRuns",
                "CacheEnabled",
                "CacheTTLMinutes",
                "CacheMaxSize",
                "EmbeddingVector",
                "EmbeddingModelID",
                "CacheValidationSQL",
                "SQLDialectID",
                "Reusable",
                "ExternalDataSourceID",
                "IsMaterialized"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                CASE WHEN p_userquestion_clear = true THEN NULL ELSE COALESCE(p_userquestion, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_sql_clear = true THEN NULL ELSE COALESCE(p_sql, NULL) END,
                CASE WHEN p_technicaldescription_clear = true THEN NULL ELSE COALESCE(p_technicaldescription, NULL) END,
                CASE WHEN p_originalsql_clear = true THEN NULL ELSE COALESCE(p_originalsql, NULL) END,
                CASE WHEN p_feedback_clear = true THEN NULL ELSE COALESCE(p_feedback, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_qualityrank_clear = true THEN NULL ELSE COALESCE(p_qualityrank, 0) END,
                CASE WHEN p_executioncostrank_clear = true THEN NULL ELSE COALESCE(p_executioncostrank, NULL) END,
                CASE WHEN p_usestemplate_clear = true THEN NULL ELSE COALESCE(p_usestemplate, FALSE) END,
                COALESCE(p_auditqueryruns, FALSE),
                COALESCE(p_cacheenabled, FALSE),
                CASE WHEN p_cachettlminutes_clear = true THEN NULL ELSE COALESCE(p_cachettlminutes, NULL) END,
                CASE WHEN p_cachemaxsize_clear = true THEN NULL ELSE COALESCE(p_cachemaxsize, NULL) END,
                CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_cachevalidationsql_clear = true THEN NULL ELSE COALESCE(p_cachevalidationsql, NULL) END,
                CASE WHEN p_sqldialectid = '00000000-0000-0000-0000-000000000000'::UUID THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE COALESCE(p_sqldialectid, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                COALESCE(p_reusable, FALSE),
                CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, NULL) END,
                COALESCE(p_ismaterialized, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwQueries"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQuery" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spCreateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQuery" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spUpdateQuery
-- Generated at: 2026-08-20T23:47:34.624Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateQuery"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_userquestion_clear boolean DEFAULT false,
    p_userquestion TEXT DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sql_clear boolean DEFAULT false,
    p_sql TEXT DEFAULT NULL,
    p_technicaldescription_clear boolean DEFAULT false,
    p_technicaldescription TEXT DEFAULT NULL,
    p_originalsql_clear boolean DEFAULT false,
    p_originalsql TEXT DEFAULT NULL,
    p_feedback_clear boolean DEFAULT false,
    p_feedback TEXT DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_qualityrank_clear boolean DEFAULT false,
    p_qualityrank int DEFAULT NULL,
    p_executioncostrank_clear boolean DEFAULT false,
    p_executioncostrank int DEFAULT NULL,
    p_usestemplate_clear boolean DEFAULT false,
    p_usestemplate BOOLEAN DEFAULT NULL,
    p_auditqueryruns BOOLEAN DEFAULT NULL,
    p_cacheenabled BOOLEAN DEFAULT NULL,
    p_cachettlminutes_clear boolean DEFAULT false,
    p_cachettlminutes int DEFAULT NULL,
    p_cachemaxsize_clear boolean DEFAULT false,
    p_cachemaxsize int DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_cachevalidationsql_clear boolean DEFAULT false,
    p_cachevalidationsql TEXT DEFAULT NULL,
    p_sqldialectid UUID DEFAULT NULL,
    p_reusable BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_ismaterialized BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueries" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Query"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "UserQuestion" = CASE WHEN p_userquestion_clear = true THEN NULL ELSE COALESCE(p_userquestion, "UserQuestion") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "SQL" = CASE WHEN p_sql_clear = true THEN NULL ELSE COALESCE(p_sql, "SQL") END,
        "TechnicalDescription" = CASE WHEN p_technicaldescription_clear = true THEN NULL ELSE COALESCE(p_technicaldescription, "TechnicalDescription") END,
        "OriginalSQL" = CASE WHEN p_originalsql_clear = true THEN NULL ELSE COALESCE(p_originalsql, "OriginalSQL") END,
        "Feedback" = CASE WHEN p_feedback_clear = true THEN NULL ELSE COALESCE(p_feedback, "Feedback") END,
        "Status" = COALESCE(p_status, "Status"),
        "QualityRank" = CASE WHEN p_qualityrank_clear = true THEN NULL ELSE COALESCE(p_qualityrank, "QualityRank") END,
        "ExecutionCostRank" = CASE WHEN p_executioncostrank_clear = true THEN NULL ELSE COALESCE(p_executioncostrank, "ExecutionCostRank") END,
        "UsesTemplate" = CASE WHEN p_usestemplate_clear = true THEN NULL ELSE COALESCE(p_usestemplate, "UsesTemplate") END,
        "AuditQueryRuns" = COALESCE(p_auditqueryruns, "AuditQueryRuns"),
        "CacheEnabled" = COALESCE(p_cacheenabled, "CacheEnabled"),
        "CacheTTLMinutes" = CASE WHEN p_cachettlminutes_clear = true THEN NULL ELSE COALESCE(p_cachettlminutes, "CacheTTLMinutes") END,
        "CacheMaxSize" = CASE WHEN p_cachemaxsize_clear = true THEN NULL ELSE COALESCE(p_cachemaxsize, "CacheMaxSize") END,
        "EmbeddingVector" = CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "CacheValidationSQL" = CASE WHEN p_cachevalidationsql_clear = true THEN NULL ELSE COALESCE(p_cachevalidationsql, "CacheValidationSQL") END,
        "SQLDialectID" = COALESCE(p_sqldialectid, "SQLDialectID"),
        "Reusable" = COALESCE(p_reusable, "Reusable"),
        "ExternalDataSourceID" = CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, "ExternalDataSourceID") END,
        "IsMaterialized" = COALESCE(p_ismaterialized, "IsMaterialized")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwQueries"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQuery" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_query"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_query" ON "__mj"."Query";

CREATE TRIGGER "trg_update_query"
BEFORE UPDATE ON "__mj"."Query"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_query"();


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQuery" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spDeleteQuery
-- Generated at: 2026-08-20T23:47:34.624Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteQuery"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Data Context Items.QueryID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DataContextItem"
        WHERE "QueryID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DataContextItem"
        SET "QueryID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Materialized Result Queries records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."MaterializedResultQuery"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteMaterializedResultQuery"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryDependency"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via DependsOnQueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryDependency"
        WHERE "DependsOnQueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Entities records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryEntity"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryEntity"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Fields records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryField"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryField"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Parameters records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryParameter"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryParameter"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Permissions records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryPermission"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query SQLs records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QuerySQL"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQuerySQL"(v_rec."ID");
    END LOOP;

    
    DELETE FROM "__mj"."Query"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQuery" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQuery" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: RSU Pending Works
-- Item: vwRSUPendingWorks
-- Generated at: 2026-08-20T23:47:34.828Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: RSU Pending Works
-----               SCHEMA:      __mj
-----               BASE TABLE:  RSUPendingWork
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRSUPendingWorks"
AS
SELECT
    r.*,
    MJCompanyIntegration_CompanyIntegrationID."Name" AS "CompanyIntegration"
FROM
    "__mj"."RSUPendingWork" AS r
INNER JOIN
    "__mj"."CompanyIntegration" AS MJCompanyIntegration_CompanyIntegrationID
  ON
    "r"."CompanyIntegrationID" = MJCompanyIntegration_CompanyIntegrationID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwRSUPendingWorks'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwRSUPendingWorks'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwRSUPendingWorks'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwRSUPendingWorks" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwRSUPendingWorks" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRSUPendingWorks" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRSUPendingWorks" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: RSU Pending Works
-- Item: Permissions for vwRSUPendingWorks
-- Generated at: 2026-08-20T23:47:34.829Z
-- ============================================================
GRANT SELECT ON "__mj"."vwRSUPendingWorks" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRSUPendingWorks" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRSUPendingWorks" TO "cdp_Integration";
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: RSU Pending Works
-- Item: spCreateRSUPendingWork
-- Generated at: 2026-08-20T23:47:34.829Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RSUPendingWork
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRSUPendingWork'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRSUPendingWork"(
    p_id UUID DEFAULT NULL,
    p_companyintegrationid UUID DEFAULT NULL,
    p_payloadjson TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_processedat_clear boolean DEFAULT false,
    p_processedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwRSUPendingWorks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RSUPendingWork"
        (
            "ID",
            "CompanyIntegrationID",
                "PayloadJSON",
                "Status",
                "ErrorMessage",
                "ProcessedAt"
        )
    VALUES
        (
            v_new_id,
            p_companyintegrationid,
                p_payloadjson,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_processedat_clear = true THEN NULL ELSE COALESCE(p_processedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRSUPendingWorks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRSUPendingWork" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRSUPendingWork" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spCreateRSUPendingWork" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRSUPendingWork" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: RSU Pending Works
-- Item: spUpdateRSUPendingWork
-- Generated at: 2026-08-20T23:47:34.830Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RSUPendingWork
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRSUPendingWork'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRSUPendingWork"(
    p_id UUID,
    p_companyintegrationid UUID DEFAULT NULL,
    p_payloadjson TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_processedat_clear boolean DEFAULT false,
    p_processedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwRSUPendingWorks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RSUPendingWork"
    SET
        "CompanyIntegrationID" = COALESCE(p_companyintegrationid, "CompanyIntegrationID"),
        "PayloadJSON" = COALESCE(p_payloadjson, "PayloadJSON"),
        "Status" = COALESCE(p_status, "Status"),
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "ProcessedAt" = CASE WHEN p_processedat_clear = true THEN NULL ELSE COALESCE(p_processedat, "ProcessedAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRSUPendingWorks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRSUPendingWork" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRSUPendingWork" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RSUPendingWork table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_rsu_pending_work"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_rsu_pending_work" ON "__mj"."RSUPendingWork";

CREATE TRIGGER "trg_update_rsu_pending_work"
BEFORE UPDATE ON "__mj"."RSUPendingWork"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_rsu_pending_work"();


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRSUPendingWork" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRSUPendingWork" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: RSU Pending Works
-- Item: spDeleteRSUPendingWork
-- Generated at: 2026-08-20T23:47:34.830Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RSUPendingWork
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRSUPendingWork'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRSUPendingWork"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RSUPendingWork"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRSUPendingWork" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRSUPendingWork" TO "cdp_Integration";

GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRSUPendingWork" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRSUPendingWork" TO "cdp_Integration";

