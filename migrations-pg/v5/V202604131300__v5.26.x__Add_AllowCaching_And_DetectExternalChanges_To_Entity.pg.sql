
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Add AllowCaching and DetectExternalChanges columns to Entity table.
--
-- AllowCaching: When false (default), the entire cache code path is
-- short-circuited for that entity. This column is the single source of
-- truth at runtime. Schema-level opt-in is handled at CodeGen time via
-- the `newEntityDefaults."AllowCachingBySchema"` config, which flips this
-- flag when an entity is first inserted into the metadata. Existing
-- core (__mj) entities are backfilled below so they remain cacheable
-- after this migration.
--
-- DetectExternalChanges: When true AND TrackRecordChanges is also true,
-- the external change detection system scans this entity for changes
-- made outside the MJ framework. Default is 0 (opt-out) because most
-- entities are managed by migrations/CodeGen and should not be scanned.

ALTER TABLE __mj."Entity"
 ADD COLUMN "AllowCaching" BOOLEAN NOT NULL CONSTRAINT DF_Entity_AllowCaching DEFAULT FALSE,
 ADD COLUMN "DetectExternalChanges" BOOLEAN NOT NULL CONSTRAINT DF_Entity_DetectExternalChanges DEFAULT FALSE;


-- ===================== Views =====================

-- Refresh __mj."vwEntities" to expose the new Entity columns added above plus
-- five earlier-migration columns that drifted from the hand-rolled view
-- (BaseViewGenerated=FALSE, so CodeGen does not regenerate it). SQL Server's
-- counterpart of this migration uses EXEC sp_refreshview, which works because
-- the SQL Server view body is "SELECT e.*". On PG the view lists columns
-- explicitly, so we must regenerate it here.
--
-- This is a plain CREATE OR REPLACE VIEW — no DROP CASCADE, no 42P16 fallback.
-- PG allows replacing a view as long as the new column list is a superset that
-- preserves existing column names, types, and order. The 7 new columns are
-- appended at the very end. Subsequent codegen runs that regenerate the view
-- can place them in their natural position; appending here just guarantees the
-- migration completes without disturbing dependent views or functions.
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
    __mj."GetProgrammaticName"(COALESCE(__mj."StripToAlphanumeric"(si."EntityNamePrefix"::text), ''::text) || replace(
        CASE
            WHEN si."EntityNamePrefix" IS NOT NULL THEN replace(e."Name"::text, si."EntityNamePrefix"::text, ''::text)::character varying
            ELSE e."Name"
        END::text, ' '::text, ''::text)) AS "CodeName",
    __mj."GetProgrammaticName"((COALESCE(__mj."StripToAlphanumeric"(si."EntityNamePrefix"::text), ''::text) || e."BaseTable"::text) || COALESCE(e."NameSuffix", ''::character varying)::text) AS "ClassName",
    __mj."GetProgrammaticName"(e."BaseTable"::text || COALESCE(e."NameSuffix", ''::character varying)::text) AS "BaseTableCodeName",
    par."Name" AS "ParentEntity",
    par."BaseTable" AS "ParentBaseTable",
    par."BaseView" AS "ParentBaseView",
    -- New columns (appended to preserve existing column order/positions for
    -- PG's CREATE OR REPLACE VIEW compatibility).
    e."AutoUpdateFullTextSearch",
    e."AutoUpdateAllowUserSearchAPI",
    e."TrustServerCacheCompletely",
    e."SupportsGeoCoding",
    e."AutoUpdateSupportsGeoCoding",
    e."AllowCaching",
    e."DetectExternalChanges"
FROM __mj."Entity" e
  LEFT JOIN __mj."Entity" par ON e."ParentID" = par."ID"
  LEFT JOIN __mj."SchemaInfo" si ON e."SchemaName"::text = si."SchemaName"::text;


DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwEntitiesWithExternalChangeTracking';
  -- Manual fix: query the base Entity/EntityField tables instead of vwEntities/vwEntityFields.
  -- PG views resolve SELECT * at creation time and the baseline vwEntities was frozen
  -- before DetectExternalChanges existed. The view won't auto-refresh when we
  -- ALTER Entity ADD COLUMN DetectExternalChanges earlier in this file, so
  -- vwEntities.DetectExternalChanges would fail. Same for EntityField ref.
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntitiesWithExternalChangeTracking"
AS SELECT
  e.*
FROM
  __mj."Entity" e
WHERE
  e."TrackRecordChanges" = TRUE
  AND e."DetectExternalChanges" = TRUE
  AND EXISTS (
    SELECT 1
    FROM __mj."EntityField" ef
    WHERE ef."Name" = '__mj_UpdatedAt' AND ef."EntityID" = e."ID"
  )
  AND EXISTS (
    SELECT 1
    FROM __mj."EntityField" ef
    WHERE ef."Name" = '__mj_CreatedAt' AND ef."EntityID" = e."ID"
  )$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateEntity"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_NameSuffix VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AutoUpdateDescription BOOLEAN DEFAULT NULL,
    IN p_BaseView VARCHAR(255) DEFAULT NULL,
    IN p_BaseViewGenerated BOOLEAN DEFAULT NULL,
    IN p_VirtualEntity BOOLEAN DEFAULT NULL,
    IN p_TrackRecordChanges BOOLEAN DEFAULT NULL,
    IN p_AuditRecordAccess BOOLEAN DEFAULT NULL,
    IN p_AuditViewRuns BOOLEAN DEFAULT NULL,
    IN p_IncludeInAPI BOOLEAN DEFAULT NULL,
    IN p_AllowAllRowsAPI BOOLEAN DEFAULT NULL,
    IN p_AllowUpdateAPI BOOLEAN DEFAULT NULL,
    IN p_AllowCreateAPI BOOLEAN DEFAULT NULL,
    IN p_AllowDeleteAPI BOOLEAN DEFAULT NULL,
    IN p_CustomResolverAPI BOOLEAN DEFAULT NULL,
    IN p_AllowUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_FullTextSearchEnabled BOOLEAN DEFAULT NULL,
    IN p_FullTextCatalog VARCHAR(255) DEFAULT NULL,
    IN p_FullTextCatalogGenerated BOOLEAN DEFAULT NULL,
    IN p_FullTextIndex VARCHAR(255) DEFAULT NULL,
    IN p_FullTextIndexGenerated BOOLEAN DEFAULT NULL,
    IN p_FullTextSearchFunction VARCHAR(255) DEFAULT NULL,
    IN p_FullTextSearchFunctionGenerated BOOLEAN DEFAULT NULL,
    IN p_UserViewMaxRows INTEGER DEFAULT NULL,
    IN p_spCreate VARCHAR(255) DEFAULT NULL,
    IN p_spUpdate VARCHAR(255) DEFAULT NULL,
    IN p_spDelete VARCHAR(255) DEFAULT NULL,
    IN p_spCreateGenerated BOOLEAN DEFAULT NULL,
    IN p_spUpdateGenerated BOOLEAN DEFAULT NULL,
    IN p_spDeleteGenerated BOOLEAN DEFAULT NULL,
    IN p_CascadeDeletes BOOLEAN DEFAULT NULL,
    IN p_DeleteType VARCHAR(10) DEFAULT NULL,
    IN p_AllowRecordMerge BOOLEAN DEFAULT NULL,
    IN p_spMatch VARCHAR(255) DEFAULT NULL,
    IN p_RelationshipDefaultDisplayType VARCHAR(20) DEFAULT NULL,
    IN p_UserFormGenerated BOOLEAN DEFAULT NULL,
    IN p_EntityObjectSubclassName VARCHAR(255) DEFAULT NULL,
    IN p_EntityObjectSubclassImport VARCHAR(255) DEFAULT NULL,
    IN p_PreferredCommunicationField VARCHAR(255) DEFAULT NULL,
    IN p_Icon VARCHAR(500) DEFAULT NULL,
    IN p_ScopeDefault VARCHAR(100) DEFAULT NULL,
    IN p_RowsToPackWithSchema VARCHAR(20) DEFAULT NULL,
    IN p_RowsToPackSampleMethod VARCHAR(20) DEFAULT NULL,
    IN p_RowsToPackSampleCount INTEGER DEFAULT NULL,
    IN p_RowsToPackSampleOrder TEXT DEFAULT NULL,
    IN p_AutoRowCountFrequency INTEGER DEFAULT NULL,
    IN p_RowCount BIGINT DEFAULT NULL,
    IN p_RowCountRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_AllowMultipleSubtypes BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateFullTextSearch BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateAllowUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_TrustServerCacheCompletely BOOLEAN DEFAULT NULL,
    IN p_SupportsGeoCoding BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateSupportsGeoCoding BOOLEAN DEFAULT NULL,
    IN p_AllowCaching BOOLEAN DEFAULT NULL,
    IN p_DetectExternalChanges BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwEntities" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."Entity"
            (
                "ID",
                "ParentID",
                "Name",
                "NameSuffix",
                "Description",
                "AutoUpdateDescription",
                "BaseView",
                "BaseViewGenerated",
                "VirtualEntity",
                "TrackRecordChanges",
                "AuditRecordAccess",
                "AuditViewRuns",
                "IncludeInAPI",
                "AllowAllRowsAPI",
                "AllowUpdateAPI",
                "AllowCreateAPI",
                "AllowDeleteAPI",
                "CustomResolverAPI",
                "AllowUserSearchAPI",
                "FullTextSearchEnabled",
                "FullTextCatalog",
                "FullTextCatalogGenerated",
                "FullTextIndex",
                "FullTextIndexGenerated",
                "FullTextSearchFunction",
                "FullTextSearchFunctionGenerated",
                "UserViewMaxRows",
                "spCreate",
                "spUpdate",
                "spDelete",
                "spCreateGenerated",
                "spUpdateGenerated",
                "spDeleteGenerated",
                "CascadeDeletes",
                "DeleteType",
                "AllowRecordMerge",
                "spMatch",
                "RelationshipDefaultDisplayType",
                "UserFormGenerated",
                "EntityObjectSubclassName",
                "EntityObjectSubclassImport",
                "PreferredCommunicationField",
                "Icon",
                "ScopeDefault",
                "RowsToPackWithSchema",
                "RowsToPackSampleMethod",
                "RowsToPackSampleCount",
                "RowsToPackSampleOrder",
                "AutoRowCountFrequency",
                "RowCount",
                "RowCountRunAt",
                "Status",
                "DisplayName",
                "AllowMultipleSubtypes",
                "AutoUpdateFullTextSearch",
                "AutoUpdateAllowUserSearchAPI",
                "TrustServerCacheCompletely",
                "SupportsGeoCoding",
                "AutoUpdateSupportsGeoCoding",
                "AllowCaching",
                "DetectExternalChanges"
            )
        VALUES
            (
                p_ID,
                p_ParentID,
                p_Name,
                p_NameSuffix,
                p_Description,
                COALESCE(p_AutoUpdateDescription, TRUE),
                p_BaseView,
                COALESCE(p_BaseViewGenerated, TRUE),
                COALESCE(p_VirtualEntity, FALSE),
                COALESCE(p_TrackRecordChanges, TRUE),
                COALESCE(p_AuditRecordAccess, TRUE),
                COALESCE(p_AuditViewRuns, TRUE),
                COALESCE(p_IncludeInAPI, FALSE),
                COALESCE(p_AllowAllRowsAPI, FALSE),
                COALESCE(p_AllowUpdateAPI, FALSE),
                COALESCE(p_AllowCreateAPI, FALSE),
                COALESCE(p_AllowDeleteAPI, FALSE),
                COALESCE(p_CustomResolverAPI, FALSE),
                COALESCE(p_AllowUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                p_FullTextCatalog,
                COALESCE(p_FullTextCatalogGenerated, TRUE),
                p_FullTextIndex,
                COALESCE(p_FullTextIndexGenerated, TRUE),
                p_FullTextSearchFunction,
                COALESCE(p_FullTextSearchFunctionGenerated, TRUE),
                p_UserViewMaxRows,
                p_spCreate,
                p_spUpdate,
                p_spDelete,
                COALESCE(p_spCreateGenerated, TRUE),
                COALESCE(p_spUpdateGenerated, TRUE),
                COALESCE(p_spDeleteGenerated, TRUE),
                COALESCE(p_CascadeDeletes, FALSE),
                COALESCE(p_DeleteType, 'Hard'),
                COALESCE(p_AllowRecordMerge, FALSE),
                p_spMatch,
                COALESCE(p_RelationshipDefaultDisplayType, 'Search'),
                COALESCE(p_UserFormGenerated, TRUE),
                p_EntityObjectSubclassName,
                p_EntityObjectSubclassImport,
                p_PreferredCommunicationField,
                p_Icon,
                p_ScopeDefault,
                COALESCE(p_RowsToPackWithSchema, 'None'),
                COALESCE(p_RowsToPackSampleMethod, 'random'),
                COALESCE(p_RowsToPackSampleCount, 0),
                p_RowsToPackSampleOrder,
                p_AutoRowCountFrequency,
                p_RowCount,
                p_RowCountRunAt,
                COALESCE(p_Status, 'Active'),
                p_DisplayName,
                COALESCE(p_AllowMultipleSubtypes, FALSE),
                COALESCE(p_AutoUpdateFullTextSearch, TRUE),
                COALESCE(p_AutoUpdateAllowUserSearchAPI, TRUE),
                COALESCE(p_TrustServerCacheCompletely, TRUE),
                COALESCE(p_SupportsGeoCoding, FALSE),
                COALESCE(p_AutoUpdateSupportsGeoCoding, TRUE),
                COALESCE(p_AllowCaching, FALSE),
                COALESCE(p_DetectExternalChanges, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."Entity"
            (
                "ParentID",
                "Name",
                "NameSuffix",
                "Description",
                "AutoUpdateDescription",
                "BaseView",
                "BaseViewGenerated",
                "VirtualEntity",
                "TrackRecordChanges",
                "AuditRecordAccess",
                "AuditViewRuns",
                "IncludeInAPI",
                "AllowAllRowsAPI",
                "AllowUpdateAPI",
                "AllowCreateAPI",
                "AllowDeleteAPI",
                "CustomResolverAPI",
                "AllowUserSearchAPI",
                "FullTextSearchEnabled",
                "FullTextCatalog",
                "FullTextCatalogGenerated",
                "FullTextIndex",
                "FullTextIndexGenerated",
                "FullTextSearchFunction",
                "FullTextSearchFunctionGenerated",
                "UserViewMaxRows",
                "spCreate",
                "spUpdate",
                "spDelete",
                "spCreateGenerated",
                "spUpdateGenerated",
                "spDeleteGenerated",
                "CascadeDeletes",
                "DeleteType",
                "AllowRecordMerge",
                "spMatch",
                "RelationshipDefaultDisplayType",
                "UserFormGenerated",
                "EntityObjectSubclassName",
                "EntityObjectSubclassImport",
                "PreferredCommunicationField",
                "Icon",
                "ScopeDefault",
                "RowsToPackWithSchema",
                "RowsToPackSampleMethod",
                "RowsToPackSampleCount",
                "RowsToPackSampleOrder",
                "AutoRowCountFrequency",
                "RowCount",
                "RowCountRunAt",
                "Status",
                "DisplayName",
                "AllowMultipleSubtypes",
                "AutoUpdateFullTextSearch",
                "AutoUpdateAllowUserSearchAPI",
                "TrustServerCacheCompletely",
                "SupportsGeoCoding",
                "AutoUpdateSupportsGeoCoding",
                "AllowCaching",
                "DetectExternalChanges"
            )
        VALUES
            (
                p_ParentID,
                p_Name,
                p_NameSuffix,
                p_Description,
                COALESCE(p_AutoUpdateDescription, TRUE),
                p_BaseView,
                COALESCE(p_BaseViewGenerated, TRUE),
                COALESCE(p_VirtualEntity, FALSE),
                COALESCE(p_TrackRecordChanges, TRUE),
                COALESCE(p_AuditRecordAccess, TRUE),
                COALESCE(p_AuditViewRuns, TRUE),
                COALESCE(p_IncludeInAPI, FALSE),
                COALESCE(p_AllowAllRowsAPI, FALSE),
                COALESCE(p_AllowUpdateAPI, FALSE),
                COALESCE(p_AllowCreateAPI, FALSE),
                COALESCE(p_AllowDeleteAPI, FALSE),
                COALESCE(p_CustomResolverAPI, FALSE),
                COALESCE(p_AllowUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                p_FullTextCatalog,
                COALESCE(p_FullTextCatalogGenerated, TRUE),
                p_FullTextIndex,
                COALESCE(p_FullTextIndexGenerated, TRUE),
                p_FullTextSearchFunction,
                COALESCE(p_FullTextSearchFunctionGenerated, TRUE),
                p_UserViewMaxRows,
                p_spCreate,
                p_spUpdate,
                p_spDelete,
                COALESCE(p_spCreateGenerated, TRUE),
                COALESCE(p_spUpdateGenerated, TRUE),
                COALESCE(p_spDeleteGenerated, TRUE),
                COALESCE(p_CascadeDeletes, FALSE),
                COALESCE(p_DeleteType, 'Hard'),
                COALESCE(p_AllowRecordMerge, FALSE),
                p_spMatch,
                COALESCE(p_RelationshipDefaultDisplayType, 'Search'),
                COALESCE(p_UserFormGenerated, TRUE),
                p_EntityObjectSubclassName,
                p_EntityObjectSubclassImport,
                p_PreferredCommunicationField,
                p_Icon,
                p_ScopeDefault,
                COALESCE(p_RowsToPackWithSchema, 'None'),
                COALESCE(p_RowsToPackSampleMethod, 'random'),
                COALESCE(p_RowsToPackSampleCount, 0),
                p_RowsToPackSampleOrder,
                p_AutoRowCountFrequency,
                p_RowCount,
                p_RowCountRunAt,
                COALESCE(p_Status, 'Active'),
                p_DisplayName,
                COALESCE(p_AllowMultipleSubtypes, FALSE),
                COALESCE(p_AutoUpdateFullTextSearch, TRUE),
                COALESCE(p_AutoUpdateAllowUserSearchAPI, TRUE),
                COALESCE(p_TrustServerCacheCompletely, TRUE),
                COALESCE(p_SupportsGeoCoding, FALSE),
                COALESCE(p_AutoUpdateSupportsGeoCoding, TRUE),
                COALESCE(p_AllowCaching, FALSE),
                COALESCE(p_DetectExternalChanges, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntity"(
    IN p_ID UUID,
    IN p_ParentID UUID,
    IN p_Name VARCHAR(255),
    IN p_NameSuffix VARCHAR(255),
    IN p_Description TEXT,
    IN p_AutoUpdateDescription BOOLEAN,
    IN p_BaseView VARCHAR(255),
    IN p_BaseViewGenerated BOOLEAN,
    IN p_VirtualEntity BOOLEAN,
    IN p_TrackRecordChanges BOOLEAN,
    IN p_AuditRecordAccess BOOLEAN,
    IN p_AuditViewRuns BOOLEAN,
    IN p_IncludeInAPI BOOLEAN,
    IN p_AllowAllRowsAPI BOOLEAN,
    IN p_AllowUpdateAPI BOOLEAN,
    IN p_AllowCreateAPI BOOLEAN,
    IN p_AllowDeleteAPI BOOLEAN,
    IN p_CustomResolverAPI BOOLEAN,
    IN p_AllowUserSearchAPI BOOLEAN,
    IN p_FullTextSearchEnabled BOOLEAN,
    IN p_FullTextCatalog VARCHAR(255),
    IN p_FullTextCatalogGenerated BOOLEAN,
    IN p_FullTextIndex VARCHAR(255),
    IN p_FullTextIndexGenerated BOOLEAN,
    IN p_FullTextSearchFunction VARCHAR(255),
    IN p_FullTextSearchFunctionGenerated BOOLEAN,
    IN p_UserViewMaxRows INTEGER,
    IN p_spCreate VARCHAR(255),
    IN p_spUpdate VARCHAR(255),
    IN p_spDelete VARCHAR(255),
    IN p_spCreateGenerated BOOLEAN,
    IN p_spUpdateGenerated BOOLEAN,
    IN p_spDeleteGenerated BOOLEAN,
    IN p_CascadeDeletes BOOLEAN,
    IN p_DeleteType VARCHAR(10),
    IN p_AllowRecordMerge BOOLEAN,
    IN p_spMatch VARCHAR(255),
    IN p_RelationshipDefaultDisplayType VARCHAR(20),
    IN p_UserFormGenerated BOOLEAN,
    IN p_EntityObjectSubclassName VARCHAR(255),
    IN p_EntityObjectSubclassImport VARCHAR(255),
    IN p_PreferredCommunicationField VARCHAR(255),
    IN p_Icon VARCHAR(500),
    IN p_ScopeDefault VARCHAR(100),
    IN p_RowsToPackWithSchema VARCHAR(20),
    IN p_RowsToPackSampleMethod VARCHAR(20),
    IN p_RowsToPackSampleCount INTEGER,
    IN p_RowsToPackSampleOrder TEXT,
    IN p_AutoRowCountFrequency INTEGER,
    IN p_RowCount BIGINT,
    IN p_RowCountRunAt TIMESTAMPTZ,
    IN p_Status VARCHAR(25),
    IN p_DisplayName VARCHAR(255),
    IN p_AllowMultipleSubtypes BOOLEAN,
    IN p_AutoUpdateFullTextSearch BOOLEAN,
    IN p_AutoUpdateAllowUserSearchAPI BOOLEAN,
    IN p_TrustServerCacheCompletely BOOLEAN,
    IN p_SupportsGeoCoding BOOLEAN,
    IN p_AutoUpdateSupportsGeoCoding BOOLEAN,
    IN p_AllowCaching BOOLEAN,
    IN p_DetectExternalChanges BOOLEAN
)
RETURNS SETOF __mj."vwEntities" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."Entity"
    SET
        "ParentID" = p_ParentID,
        "Name" = p_Name,
        "NameSuffix" = p_NameSuffix,
        "Description" = p_Description,
        "AutoUpdateDescription" = p_AutoUpdateDescription,
        "BaseView" = p_BaseView,
        "BaseViewGenerated" = p_BaseViewGenerated,
        "VirtualEntity" = p_VirtualEntity,
        "TrackRecordChanges" = p_TrackRecordChanges,
        "AuditRecordAccess" = p_AuditRecordAccess,
        "AuditViewRuns" = p_AuditViewRuns,
        "IncludeInAPI" = p_IncludeInAPI,
        "AllowAllRowsAPI" = p_AllowAllRowsAPI,
        "AllowUpdateAPI" = p_AllowUpdateAPI,
        "AllowCreateAPI" = p_AllowCreateAPI,
        "AllowDeleteAPI" = p_AllowDeleteAPI,
        "CustomResolverAPI" = p_CustomResolverAPI,
        "AllowUserSearchAPI" = p_AllowUserSearchAPI,
        "FullTextSearchEnabled" = p_FullTextSearchEnabled,
        "FullTextCatalog" = p_FullTextCatalog,
        "FullTextCatalogGenerated" = p_FullTextCatalogGenerated,
        "FullTextIndex" = p_FullTextIndex,
        "FullTextIndexGenerated" = p_FullTextIndexGenerated,
        "FullTextSearchFunction" = p_FullTextSearchFunction,
        "FullTextSearchFunctionGenerated" = p_FullTextSearchFunctionGenerated,
        "UserViewMaxRows" = p_UserViewMaxRows,
        "spCreate" = p_spCreate,
        "spUpdate" = p_spUpdate,
        "spDelete" = p_spDelete,
        "spCreateGenerated" = p_spCreateGenerated,
        "spUpdateGenerated" = p_spUpdateGenerated,
        "spDeleteGenerated" = p_spDeleteGenerated,
        "CascadeDeletes" = p_CascadeDeletes,
        "DeleteType" = p_DeleteType,
        "AllowRecordMerge" = p_AllowRecordMerge,
        "spMatch" = p_spMatch,
        "RelationshipDefaultDisplayType" = p_RelationshipDefaultDisplayType,
        "UserFormGenerated" = p_UserFormGenerated,
        "EntityObjectSubclassName" = p_EntityObjectSubclassName,
        "EntityObjectSubclassImport" = p_EntityObjectSubclassImport,
        "PreferredCommunicationField" = p_PreferredCommunicationField,
        "Icon" = p_Icon,
        "ScopeDefault" = p_ScopeDefault,
        "RowsToPackWithSchema" = p_RowsToPackWithSchema,
        "RowsToPackSampleMethod" = p_RowsToPackSampleMethod,
        "RowsToPackSampleCount" = p_RowsToPackSampleCount,
        "RowsToPackSampleOrder" = p_RowsToPackSampleOrder,
        "AutoRowCountFrequency" = p_AutoRowCountFrequency,
        "RowCount" = p_RowCount,
        "RowCountRunAt" = p_RowCountRunAt,
        "Status" = p_Status,
        "DisplayName" = p_DisplayName,
        "AllowMultipleSubtypes" = p_AllowMultipleSubtypes,
        "AutoUpdateFullTextSearch" = p_AutoUpdateFullTextSearch,
        "AutoUpdateAllowUserSearchAPI" = p_AutoUpdateAllowUserSearchAPI,
        "TrustServerCacheCompletely" = p_TrustServerCacheCompletely,
        "SupportsGeoCoding" = p_SupportsGeoCoding,
        "AutoUpdateSupportsGeoCoding" = p_AutoUpdateSupportsGeoCoding,
        "AllowCaching" = p_AllowCaching,
        "DetectExternalChanges" = p_DetectExternalChanges
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntities" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntities" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Backfill AllowCaching for core schema entities so the existing caching
-- behavior (previously granted by the removed cacheSettings.enableForSchemas
-- runtime override) is preserved after this migration.
UPDATE __mj."Entity"
SET "AllowCaching" = TRUE
WHERE "SchemaName" = '__mj';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4F750011-FEAF-4635-A017-344C1F3851E6' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AllowCaching')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '4F750011-FEAF-4635-A017-344C1F3851E6',
        'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entities"
        100013,
        'AllowCaching',
        'Allow Caching',
        'Controls whether this entity participates in server-side and client-side caching. When false, all cache operations (PreRunView checks, auto-cache storage, BaseEntity event fingerprint scans, client-side IndexedDB cache) are skipped entirely. This column is the single source of truth at runtime; schema-level defaults are applied at CodeGen time via newEntityDefaults."AllowCachingBySchema".',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE, -- "AllowsNull"
        '((0))',
        FALSE, -- "AutoIncrement"
        TRUE, -- "AllowUpdateAPI"
        FALSE, -- "IsVirtual"
        FALSE, -- "IsNameField"
        FALSE, -- "IncludeInUserSearchAPI"
        FALSE, -- "IncludeRelatedEntityNameFieldInBaseView"
        FALSE, -- "DefaultInView"
        FALSE, -- "IsPrimaryKey"
        FALSE, -- "IsUnique"
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'A507B1C9-ABA5-4ECF-8137-36BC6FEFA018' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'DetectExternalChanges')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        'A507B1C9-ABA5-4ECF-8137-36BC6FEFA018',
        'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entities"
        100014,
        'DetectExternalChanges',
        'Detect External Changes',
        'When set to 1 AND TrackRecordChanges is also 1, the external change detection system will scan this entity for changes made outside the MJ framework (direct SQL, third-party tools, etc.) and replay them through Save() to create proper RecordChange audit entries. Default is 0 (opt-out) because most entities, especially __mj schema metadata tables, are managed by migrations/CodeGen and should not be scanned.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE, -- "AllowsNull"
        '((0))',
        FALSE, -- "AutoIncrement"
        TRUE, -- "AllowUpdateAPI"
        FALSE, -- "IsVirtual"
        FALSE, -- "IsNameField"
        FALSE, -- "IncludeInUserSearchAPI"
        FALSE, -- "IncludeRelatedEntityNameFieldInBaseView"
        FALSE, -- "DefaultInView"
        FALSE, -- "IsPrimaryKey"
        FALSE, -- "IsUnique"
        'Search'
        );
    END IF;
END $$;


-- ===================== Grants =====================

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Comments =====================

COMMENT ON COLUMN __mj."Entity"."AllowCaching" IS 'Controls whether this entity participates in server-side and client-side caching. When false, all cache operations (PreRunView checks, auto-cache storage, BaseEntity event fingerprint scans, client-side IndexedDB cache) are skipped entirely. This column is the single source of truth at runtime; schema-level defaults are applied at CodeGen time via newEntityDefaults."AllowCachingBySchema".';

COMMENT ON COLUMN __mj."Entity"."DetectExternalChanges" IS 'When set to 1 AND TrackRecordChanges is also 1, the external change detection system will scan this entity for changes made outside the MJ framework (direct SQL, third-party tools, etc.) and replay them through Save() to create proper RecordChange audit entries. Default is 0 (opt-out) because most entities, especially __mj schema metadata tables, are managed by migrations/CodeGen and should not be scanned.';
