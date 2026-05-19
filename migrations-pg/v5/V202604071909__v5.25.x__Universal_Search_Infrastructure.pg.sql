
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Universal Search Infrastructure
--
-- Schema changes to support the MJ Universal Search feature:
--   EntityField:  +UserSearchPredicateAPI, +AutoUpdateUserSearchPredicate, +AutoUpdateFullTextSearch
--   Entity:       +AutoUpdateFullTextSearch, +AutoUpdateAllowUserSearchAPI
--   FileStorageAccount: +IncludeInGlobalSearch
--   FileStorageAccountPermission: NEW TABLE (account-level access control)
--   InstanceConfiguration: NEW TABLE (instance-level feature toggles)
--

----------------------------------------------------------------------
-- 1. EntityField: Search predicate and auto-update fields
----------------------------------------------------------------------
ALTER TABLE __mj."EntityField"
 ADD COLUMN "UserSearchPredicateAPI" VARCHAR(20) NOT NULL DEFAULT 'Contains',
 ADD COLUMN "AutoUpdateUserSearchPredicate" BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN "AutoUpdateFullTextSearch" BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN "AutoUpdateExtendedType" BOOLEAN NOT NULL DEFAULT TRUE;

----------------------------------------------------------------------
-- 2. Entity: FTS and search API auto-update fields
----------------------------------------------------------------------
ALTER TABLE __mj."Entity"
 ADD COLUMN "AutoUpdateFullTextSearch" BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN "AutoUpdateAllowUserSearchAPI" BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN "TrustServerCacheCompletely" BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN "SupportsGeoCoding" BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN "AutoUpdateSupportsGeoCoding" BOOLEAN NOT NULL DEFAULT TRUE;

----------------------------------------------------------------------
-- 3. FileStorageAccount: Global search inclusion
----------------------------------------------------------------------
ALTER TABLE __mj."FileStorageAccount"
 ADD COLUMN "IncludeInGlobalSearch" BOOLEAN NOT NULL DEFAULT FALSE;

----------------------------------------------------------------------
-- 4. FileStorageAccountPermission: Account-level access control
----------------------------------------------------------------------
CREATE TABLE __mj."FileStorageAccountPermission" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FileStorageAccountID" UUID NOT NULL,
 "Type" VARCHAR(20) NOT NULL DEFAULT 'Role',
 "UserID" UUID NULL,
 "RoleID" UUID NULL,
 "CanRead" BOOLEAN NOT NULL DEFAULT TRUE,
 "CanWrite" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT PK_FileStorageAccountPermission PRIMARY KEY ("ID"),
 CONSTRAINT FK_FileStorageAccountPermission_Account
 FOREIGN KEY ("FileStorageAccountID")
 REFERENCES __mj."FileStorageAccount"("ID"),
 CONSTRAINT FK_FileStorageAccountPermission_User
 FOREIGN KEY ("UserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT FK_FileStorageAccountPermission_Role
 FOREIGN KEY ("RoleID")
 REFERENCES __mj."Role"("ID"),
 CONSTRAINT CK_FileStorageAccountPermission_Type
 CHECK ("Type" IN ('User', 'Role', 'Everyone')),
 CONSTRAINT CK_FileStorageAccountPermission_GranteeMatch
 CHECK (
 ("Type" = 'User' AND "UserID" IS NOT NULL AND "RoleID" IS NULL) OR
 ("Type" = 'Role' AND "RoleID" IS NOT NULL AND "UserID" IS NULL) OR
 ("Type" = 'Everyone' AND "UserID" IS NULL AND "RoleID" IS NULL)
 )
);

----------------------------------------------------------------------
-- 5. InstanceConfiguration: Feature toggle system
----------------------------------------------------------------------
CREATE TABLE __mj."InstanceConfiguration" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FeatureKey" VARCHAR(200) NOT NULL,
 "Value" TEXT NOT NULL,
 "ValueType" VARCHAR(20) NOT NULL DEFAULT 'boolean',
 "Category" VARCHAR(100) NOT NULL DEFAULT 'General',
 "DisplayName" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "DefaultValue" TEXT NOT NULL,
 CONSTRAINT PK_InstanceConfiguration PRIMARY KEY ("ID"),
 CONSTRAINT CK_InstanceConfiguration_ValueType
 CHECK ("ValueType" IN ('boolean', 'string', 'number', 'json')),
 CONSTRAINT UQ_InstanceConfiguration_Key UNIQUE ("FeatureKey")
);

CREATE TABLE __mj."SearchProvider" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "DriverClass" VARCHAR(500) NOT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 "Priority" INTEGER NOT NULL DEFAULT 0,
 "SupportsPreview" BOOLEAN NOT NULL DEFAULT TRUE,
 "MaxResultsOverride" INTEGER NULL,
 "ProviderConfig" TEXT NULL,
 "CredentialID" UUID NULL,
 "DisplayName" VARCHAR(200) NULL,
 "Icon" VARCHAR(200) NULL,
 "Comments" TEXT NULL,
 CONSTRAINT PK_SearchProvider PRIMARY KEY ("ID"),
 CONSTRAINT FK_SearchProvider_Credential FOREIGN KEY ("CredentialID")
 REFERENCES __mj."Credential"("ID"),
 CONSTRAINT CK_SearchProvider_Status CHECK ("Status" IN ('Pending', 'Active', 'Terminated')),
 CONSTRAINT CK_SearchProvider_Priority CHECK ("Priority" >= 0)
);

ALTER TABLE __mj."InstanceConfiguration"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."InstanceConfiguration" */
ALTER TABLE __mj."InstanceConfiguration"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."FileStorageAccountPermission" */
ALTER TABLE __mj."FileStorageAccountPermission"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."FileStorageAccountPermission" */
ALTER TABLE __mj."FileStorageAccountPermission"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchProvider" */
ALTER TABLE __mj."SearchProvider"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchProvider" */
ALTER TABLE __mj."SearchProvider"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ApplicationEntity_ApplicationID" ON __mj."ApplicationEntity" ("ApplicationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ApplicationEntity_EntityID" ON __mj."ApplicationEntity" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Entity_ParentID" ON __mj."Entity" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID" ON __mj."EntityFieldValue" ("EntityFieldID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityField_EntityID" ON __mj."EntityField" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID" ON __mj."EntityField" ("RelatedEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID" ON __mj."EntityField" ("EncryptionKeyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FileStorageAccountPermission_FileStor_b9d89d61" ON __mj."FileStorageAccountPermission" ("FileStorageAccountID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FileStorageAccountPermission_UserID" ON __mj."FileStorageAccountPermission" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FileStorageAccountPermission_RoleID" ON __mj."FileStorageAccountPermission" ("RoleID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FileStorageAccount_ProviderID" ON __mj."FileStorageAccount" ("ProviderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FileStorageAccount_CredentialID" ON __mj."FileStorageAccount" ("CredentialID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchProvider_CredentialID" ON __mj."SearchProvider" ("CredentialID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwFileStorageAccounts';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwFileStorageAccounts"
AS SELECT
    f.*,
    "MJFileStorageProvider_ProviderID"."Name" AS "Provider",
    "MJCredential_CredentialID"."Name" AS "Credential"
FROM
    __mj."FileStorageAccount" AS f
INNER JOIN
    __mj."FileStorageProvider" AS "MJFileStorageProvider_ProviderID"
  ON
    f."ProviderID" = "MJFileStorageProvider_ProviderID"."ID"
INNER JOIN
    __mj."Credential" AS "MJCredential_CredentialID"
  ON
    f."CredentialID" = "MJCredential_CredentialID"."ID"$vsql$;
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

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwFileStorageAccountPermissions';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwFileStorageAccountPermissions"
AS SELECT
    f.*,
    "MJFileStorageAccount_FileStorageAccountID"."Name" AS "FileStorageAccount",
    "MJUser_UserID"."Name" AS "User",
    "MJRole_RoleID"."Name" AS "Role"
FROM
    __mj."FileStorageAccountPermission" AS f
INNER JOIN
    __mj."FileStorageAccount" AS "MJFileStorageAccount_FileStorageAccountID"
  ON
    f."FileStorageAccountID" = "MJFileStorageAccount_FileStorageAccountID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    f."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."Role" AS "MJRole_RoleID"
  ON
    f."RoleID" = "MJRole_RoleID"."ID"$vsql$;
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

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwInstanceConfigurations';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwInstanceConfigurations"
AS SELECT
    i.*
FROM
    __mj."InstanceConfiguration" AS i$vsql$;
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

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwSearchProviders';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSearchProviders"
AS SELECT
    s.*,
    "MJCredential_CredentialID"."Name" AS "Credential"
FROM
    __mj."SearchProvider" AS s
LEFT OUTER JOIN
    __mj."Credential" AS "MJCredential_CredentialID"
  ON
    s."CredentialID" = "MJCredential_CredentialID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateApplicationEntity"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ApplicationID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_DefaultForNewUser BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwApplicationEntities" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ApplicationEntity"
            (
                "ID",
                "ApplicationID",
                "EntityID",
                "Sequence",
                "DefaultForNewUser"
            )
        VALUES
            (
                p_ID,
                p_ApplicationID,
                p_EntityID,
                p_Sequence,
                COALESCE(p_DefaultForNewUser, TRUE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ApplicationEntity"
            (
                "ApplicationID",
                "EntityID",
                "Sequence",
                "DefaultForNewUser"
            )
        VALUES
            (
                p_ApplicationID,
                p_EntityID,
                p_Sequence,
                COALESCE(p_DefaultForNewUser, TRUE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateApplicationEntity"(
    IN p_ID UUID,
    IN p_ApplicationID UUID,
    IN p_EntityID UUID,
    IN p_Sequence INTEGER,
    IN p_DefaultForNewUser BOOLEAN
)
RETURNS SETOF __mj."vwApplicationEntities" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ApplicationEntity"
    SET
        "ApplicationID" = p_ApplicationID,
        "EntityID" = p_EntityID,
        "Sequence" = p_Sequence,
        "DefaultForNewUser" = p_DefaultForNewUser
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteApplicationEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ApplicationEntity"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

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
    IN p_AutoUpdateSupportsGeoCoding BOOLEAN DEFAULT NULL
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
                "AutoUpdateSupportsGeoCoding"
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
                COALESCE(p_AutoUpdateSupportsGeoCoding, TRUE)
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
                "AutoUpdateSupportsGeoCoding"
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
                COALESCE(p_AutoUpdateSupportsGeoCoding, TRUE)
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
    IN p_AutoUpdateSupportsGeoCoding BOOLEAN
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
        "AutoUpdateSupportsGeoCoding" = p_AutoUpdateSupportsGeoCoding
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

CREATE OR REPLACE FUNCTION __mj."spDeleteEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Entity"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityFieldValue"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityFieldID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Value VARCHAR(255) DEFAULT NULL,
    IN p_Code VARCHAR(50) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityFieldValues" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityFieldValue"
            (
                "ID",
                "EntityFieldID",
                "Sequence",
                "Value",
                "Code",
                "Description"
            )
        VALUES
            (
                p_ID,
                p_EntityFieldID,
                p_Sequence,
                p_Value,
                p_Code,
                p_Description
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityFieldValue"
            (
                "EntityFieldID",
                "Sequence",
                "Value",
                "Code",
                "Description"
            )
        VALUES
            (
                p_EntityFieldID,
                p_Sequence,
                p_Value,
                p_Code,
                p_Description
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityFieldValues" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityFieldValue"(
    IN p_ID UUID,
    IN p_EntityFieldID UUID,
    IN p_Sequence INTEGER,
    IN p_Value VARCHAR(255),
    IN p_Code VARCHAR(50),
    IN p_Description TEXT
)
RETURNS SETOF __mj."vwEntityFieldValues" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityFieldValue"
    SET
        "EntityFieldID" = p_EntityFieldID,
        "Sequence" = p_Sequence,
        "Value" = p_Value,
        "Code" = p_Code,
        "Description" = p_Description
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityFieldValues" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityFieldValues" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityField"(
    IN p_ID UUID DEFAULT NULL,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AutoUpdateDescription BOOLEAN DEFAULT NULL,
    IN p_IsPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsUnique BOOLEAN DEFAULT NULL,
    IN p_Category VARCHAR(255) DEFAULT NULL,
    IN p_ValueListType VARCHAR(20) DEFAULT NULL,
    IN p_ExtendedType VARCHAR(50) DEFAULT NULL,
    IN p_CodeType VARCHAR(50) DEFAULT NULL,
    IN p_DefaultInView BOOLEAN DEFAULT NULL,
    IN p_ViewCellTemplate TEXT DEFAULT NULL,
    IN p_DefaultColumnWidth INTEGER DEFAULT NULL,
    IN p_AllowUpdateAPI BOOLEAN DEFAULT NULL,
    IN p_AllowUpdateInView BOOLEAN DEFAULT NULL,
    IN p_IncludeInUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_FullTextSearchEnabled BOOLEAN DEFAULT NULL,
    IN p_UserSearchParamFormatAPI VARCHAR(500) DEFAULT NULL,
    IN p_IncludeInGeneratedForm BOOLEAN DEFAULT NULL,
    IN p_GeneratedFormSection VARCHAR(10) DEFAULT NULL,
    IN p_IsNameField BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityID UUID DEFAULT NULL,
    IN p_RelatedEntityFieldName VARCHAR(255) DEFAULT NULL,
    IN p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityNameFieldMap VARCHAR(255) DEFAULT NULL,
    IN p_RelatedEntityDisplayType VARCHAR(20) DEFAULT NULL,
    IN p_EntityIDFieldName VARCHAR(100) DEFAULT NULL,
    IN p_ScopeDefault VARCHAR(100) DEFAULT NULL,
    IN p_AutoUpdateRelatedEntityInfo BOOLEAN DEFAULT NULL,
    IN p_ValuesToPackWithSchema VARCHAR(10) DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_AutoUpdateIsNameField BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateDefaultInView BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateCategory BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateDisplayName BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateIncludeInUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_Encrypt BOOLEAN DEFAULT NULL,
    IN p_EncryptionKeyID UUID DEFAULT NULL,
    IN p_AllowDecryptInAPI BOOLEAN DEFAULT NULL,
    IN p_SendEncryptedValue BOOLEAN DEFAULT NULL,
    IN p_IsSoftPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsSoftForeignKey BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityJoinFields TEXT DEFAULT NULL,
    IN p_JSONType VARCHAR(255) DEFAULT NULL,
    IN p_JSONTypeIsArray BOOLEAN DEFAULT NULL,
    IN p_JSONTypeDefinition TEXT DEFAULT NULL,
    IN p_UserSearchPredicateAPI VARCHAR(20) DEFAULT NULL,
    IN p_AutoUpdateUserSearchPredicate BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateFullTextSearch BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateExtendedType BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityFields" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityField"
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
                "AutoUpdateExtendedType"
            )
        VALUES
            (
                p_ID,
                p_DisplayName,
                p_Description,
                COALESCE(p_AutoUpdateDescription, TRUE),
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUnique, FALSE),
                p_Category,
                COALESCE(p_ValueListType, 'None'),
                p_ExtendedType,
                p_CodeType,
                COALESCE(p_DefaultInView, FALSE),
                p_ViewCellTemplate,
                p_DefaultColumnWidth,
                COALESCE(p_AllowUpdateAPI, TRUE),
                COALESCE(p_AllowUpdateInView, TRUE),
                COALESCE(p_IncludeInUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                p_UserSearchParamFormatAPI,
                COALESCE(p_IncludeInGeneratedForm, TRUE),
                COALESCE(p_GeneratedFormSection, 'Details'),
                COALESCE(p_IsNameField, FALSE),
                p_RelatedEntityID,
                p_RelatedEntityFieldName,
                COALESCE(p_IncludeRelatedEntityNameFieldInBaseView, TRUE),
                p_RelatedEntityNameFieldMap,
                COALESCE(p_RelatedEntityDisplayType, 'Search'),
                p_EntityIDFieldName,
                p_ScopeDefault,
                COALESCE(p_AutoUpdateRelatedEntityInfo, TRUE),
                COALESCE(p_ValuesToPackWithSchema, 'Auto'),
                COALESCE(p_Status, 'Active'),
                COALESCE(p_AutoUpdateIsNameField, TRUE),
                COALESCE(p_AutoUpdateDefaultInView, TRUE),
                COALESCE(p_AutoUpdateCategory, TRUE),
                COALESCE(p_AutoUpdateDisplayName, TRUE),
                COALESCE(p_AutoUpdateIncludeInUserSearchAPI, TRUE),
                COALESCE(p_Encrypt, FALSE),
                p_EncryptionKeyID,
                COALESCE(p_AllowDecryptInAPI, FALSE),
                COALESCE(p_SendEncryptedValue, FALSE),
                COALESCE(p_IsSoftPrimaryKey, FALSE),
                COALESCE(p_IsSoftForeignKey, FALSE),
                p_RelatedEntityJoinFields,
                p_JSONType,
                COALESCE(p_JSONTypeIsArray, FALSE),
                p_JSONTypeDefinition,
                COALESCE(p_UserSearchPredicateAPI, 'Contains'),
                COALESCE(p_AutoUpdateUserSearchPredicate, TRUE),
                COALESCE(p_AutoUpdateFullTextSearch, TRUE),
                COALESCE(p_AutoUpdateExtendedType, TRUE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityField"
            (
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
                "AutoUpdateExtendedType"
            )
        VALUES
            (
                p_DisplayName,
                p_Description,
                COALESCE(p_AutoUpdateDescription, TRUE),
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUnique, FALSE),
                p_Category,
                COALESCE(p_ValueListType, 'None'),
                p_ExtendedType,
                p_CodeType,
                COALESCE(p_DefaultInView, FALSE),
                p_ViewCellTemplate,
                p_DefaultColumnWidth,
                COALESCE(p_AllowUpdateAPI, TRUE),
                COALESCE(p_AllowUpdateInView, TRUE),
                COALESCE(p_IncludeInUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                p_UserSearchParamFormatAPI,
                COALESCE(p_IncludeInGeneratedForm, TRUE),
                COALESCE(p_GeneratedFormSection, 'Details'),
                COALESCE(p_IsNameField, FALSE),
                p_RelatedEntityID,
                p_RelatedEntityFieldName,
                COALESCE(p_IncludeRelatedEntityNameFieldInBaseView, TRUE),
                p_RelatedEntityNameFieldMap,
                COALESCE(p_RelatedEntityDisplayType, 'Search'),
                p_EntityIDFieldName,
                p_ScopeDefault,
                COALESCE(p_AutoUpdateRelatedEntityInfo, TRUE),
                COALESCE(p_ValuesToPackWithSchema, 'Auto'),
                COALESCE(p_Status, 'Active'),
                COALESCE(p_AutoUpdateIsNameField, TRUE),
                COALESCE(p_AutoUpdateDefaultInView, TRUE),
                COALESCE(p_AutoUpdateCategory, TRUE),
                COALESCE(p_AutoUpdateDisplayName, TRUE),
                COALESCE(p_AutoUpdateIncludeInUserSearchAPI, TRUE),
                COALESCE(p_Encrypt, FALSE),
                p_EncryptionKeyID,
                COALESCE(p_AllowDecryptInAPI, FALSE),
                COALESCE(p_SendEncryptedValue, FALSE),
                COALESCE(p_IsSoftPrimaryKey, FALSE),
                COALESCE(p_IsSoftForeignKey, FALSE),
                p_RelatedEntityJoinFields,
                p_JSONType,
                COALESCE(p_JSONTypeIsArray, FALSE),
                p_JSONTypeDefinition,
                COALESCE(p_UserSearchPredicateAPI, 'Contains'),
                COALESCE(p_AutoUpdateUserSearchPredicate, TRUE),
                COALESCE(p_AutoUpdateFullTextSearch, TRUE),
                COALESCE(p_AutoUpdateExtendedType, TRUE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityField"(
    IN p_ID UUID,
    IN p_DisplayName VARCHAR(255),
    IN p_Description TEXT,
    IN p_AutoUpdateDescription BOOLEAN,
    IN p_IsPrimaryKey BOOLEAN,
    IN p_IsUnique BOOLEAN,
    IN p_Category VARCHAR(255),
    IN p_ValueListType VARCHAR(20),
    IN p_ExtendedType VARCHAR(50),
    IN p_CodeType VARCHAR(50),
    IN p_DefaultInView BOOLEAN,
    IN p_ViewCellTemplate TEXT,
    IN p_DefaultColumnWidth INTEGER,
    IN p_AllowUpdateAPI BOOLEAN,
    IN p_AllowUpdateInView BOOLEAN,
    IN p_IncludeInUserSearchAPI BOOLEAN,
    IN p_FullTextSearchEnabled BOOLEAN,
    IN p_UserSearchParamFormatAPI VARCHAR(500),
    IN p_IncludeInGeneratedForm BOOLEAN,
    IN p_GeneratedFormSection VARCHAR(10),
    IN p_IsNameField BOOLEAN,
    IN p_RelatedEntityID UUID,
    IN p_RelatedEntityFieldName VARCHAR(255),
    IN p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN,
    IN p_RelatedEntityNameFieldMap VARCHAR(255),
    IN p_RelatedEntityDisplayType VARCHAR(20),
    IN p_EntityIDFieldName VARCHAR(100),
    IN p_ScopeDefault VARCHAR(100),
    IN p_AutoUpdateRelatedEntityInfo BOOLEAN,
    IN p_ValuesToPackWithSchema VARCHAR(10),
    IN p_Status VARCHAR(25),
    IN p_AutoUpdateIsNameField BOOLEAN,
    IN p_AutoUpdateDefaultInView BOOLEAN,
    IN p_AutoUpdateCategory BOOLEAN,
    IN p_AutoUpdateDisplayName BOOLEAN,
    IN p_AutoUpdateIncludeInUserSearchAPI BOOLEAN,
    IN p_Encrypt BOOLEAN,
    IN p_EncryptionKeyID UUID,
    IN p_AllowDecryptInAPI BOOLEAN,
    IN p_SendEncryptedValue BOOLEAN,
    IN p_IsSoftPrimaryKey BOOLEAN,
    IN p_IsSoftForeignKey BOOLEAN,
    IN p_RelatedEntityJoinFields TEXT,
    IN p_JSONType VARCHAR(255),
    IN p_JSONTypeIsArray BOOLEAN,
    IN p_JSONTypeDefinition TEXT,
    IN p_UserSearchPredicateAPI VARCHAR(20),
    IN p_AutoUpdateUserSearchPredicate BOOLEAN,
    IN p_AutoUpdateFullTextSearch BOOLEAN,
    IN p_AutoUpdateExtendedType BOOLEAN
)
RETURNS SETOF __mj."vwEntityFields" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityField"
    SET
        "DisplayName" = p_DisplayName,
        "Description" = p_Description,
        "AutoUpdateDescription" = p_AutoUpdateDescription,
        "IsPrimaryKey" = p_IsPrimaryKey,
        "IsUnique" = p_IsUnique,
        "Category" = p_Category,
        "ValueListType" = p_ValueListType,
        "ExtendedType" = p_ExtendedType,
        "CodeType" = p_CodeType,
        "DefaultInView" = p_DefaultInView,
        "ViewCellTemplate" = p_ViewCellTemplate,
        "DefaultColumnWidth" = p_DefaultColumnWidth,
        "AllowUpdateAPI" = p_AllowUpdateAPI,
        "AllowUpdateInView" = p_AllowUpdateInView,
        "IncludeInUserSearchAPI" = p_IncludeInUserSearchAPI,
        "FullTextSearchEnabled" = p_FullTextSearchEnabled,
        "UserSearchParamFormatAPI" = p_UserSearchParamFormatAPI,
        "IncludeInGeneratedForm" = p_IncludeInGeneratedForm,
        "GeneratedFormSection" = p_GeneratedFormSection,
        "IsNameField" = p_IsNameField,
        "RelatedEntityID" = p_RelatedEntityID,
        "RelatedEntityFieldName" = p_RelatedEntityFieldName,
        "IncludeRelatedEntityNameFieldInBaseView" = p_IncludeRelatedEntityNameFieldInBaseView,
        "RelatedEntityNameFieldMap" = p_RelatedEntityNameFieldMap,
        "RelatedEntityDisplayType" = p_RelatedEntityDisplayType,
        "EntityIDFieldName" = p_EntityIDFieldName,
        "ScopeDefault" = p_ScopeDefault,
        "AutoUpdateRelatedEntityInfo" = p_AutoUpdateRelatedEntityInfo,
        "ValuesToPackWithSchema" = p_ValuesToPackWithSchema,
        "Status" = p_Status,
        "AutoUpdateIsNameField" = p_AutoUpdateIsNameField,
        "AutoUpdateDefaultInView" = p_AutoUpdateDefaultInView,
        "AutoUpdateCategory" = p_AutoUpdateCategory,
        "AutoUpdateDisplayName" = p_AutoUpdateDisplayName,
        "AutoUpdateIncludeInUserSearchAPI" = p_AutoUpdateIncludeInUserSearchAPI,
        "Encrypt" = p_Encrypt,
        "EncryptionKeyID" = p_EncryptionKeyID,
        "AllowDecryptInAPI" = p_AllowDecryptInAPI,
        "SendEncryptedValue" = p_SendEncryptedValue,
        "IsSoftPrimaryKey" = p_IsSoftPrimaryKey,
        "IsSoftForeignKey" = p_IsSoftForeignKey,
        "RelatedEntityJoinFields" = p_RelatedEntityJoinFields,
        "JSONType" = p_JSONType,
        "JSONTypeIsArray" = p_JSONTypeIsArray,
        "JSONTypeDefinition" = p_JSONTypeDefinition,
        "UserSearchPredicateAPI" = p_UserSearchPredicateAPI,
        "AutoUpdateUserSearchPredicate" = p_AutoUpdateUserSearchPredicate,
        "AutoUpdateFullTextSearch" = p_AutoUpdateFullTextSearch,
        "AutoUpdateExtendedType" = p_AutoUpdateExtendedType
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityFieldValue"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityFieldValue"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityField"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityField"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateFileStorageAccount"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_ProviderID UUID DEFAULT NULL,
    IN p_CredentialID UUID DEFAULT NULL,
    IN p_IncludeInGlobalSearch BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwFileStorageAccounts" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."FileStorageAccount"
            (
                "ID",
                "Name",
                "Description",
                "ProviderID",
                "CredentialID",
                "IncludeInGlobalSearch"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_ProviderID,
                p_CredentialID,
                COALESCE(p_IncludeInGlobalSearch, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."FileStorageAccount"
            (
                "Name",
                "Description",
                "ProviderID",
                "CredentialID",
                "IncludeInGlobalSearch"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_ProviderID,
                p_CredentialID,
                COALESCE(p_IncludeInGlobalSearch, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwFileStorageAccounts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateFileStorageAccount"(
    IN p_ID UUID,
    IN p_Name VARCHAR(200),
    IN p_Description TEXT,
    IN p_ProviderID UUID,
    IN p_CredentialID UUID,
    IN p_IncludeInGlobalSearch BOOLEAN
)
RETURNS SETOF __mj."vwFileStorageAccounts" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."FileStorageAccount"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ProviderID" = p_ProviderID,
        "CredentialID" = p_CredentialID,
        "IncludeInGlobalSearch" = p_IncludeInGlobalSearch
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwFileStorageAccounts" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwFileStorageAccounts" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteFileStorageAccount"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."FileStorageAccount"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateFileStorageAccountPermission"(
    IN p_ID UUID DEFAULT NULL,
    IN p_FileStorageAccountID UUID DEFAULT NULL,
    IN p_Type VARCHAR(20) DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_RoleID UUID DEFAULT NULL,
    IN p_CanRead BOOLEAN DEFAULT NULL,
    IN p_CanWrite BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwFileStorageAccountPermissions" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."FileStorageAccountPermission"
            (
                "ID",
                "FileStorageAccountID",
                "Type",
                "UserID",
                "RoleID",
                "CanRead",
                "CanWrite"
            )
        VALUES
            (
                p_ID,
                p_FileStorageAccountID,
                COALESCE(p_Type, 'Role'),
                p_UserID,
                p_RoleID,
                COALESCE(p_CanRead, TRUE),
                COALESCE(p_CanWrite, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."FileStorageAccountPermission"
            (
                "FileStorageAccountID",
                "Type",
                "UserID",
                "RoleID",
                "CanRead",
                "CanWrite"
            )
        VALUES
            (
                p_FileStorageAccountID,
                COALESCE(p_Type, 'Role'),
                p_UserID,
                p_RoleID,
                COALESCE(p_CanRead, TRUE),
                COALESCE(p_CanWrite, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwFileStorageAccountPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateFileStorageAccountPermission"(
    IN p_ID UUID,
    IN p_FileStorageAccountID UUID,
    IN p_Type VARCHAR(20),
    IN p_UserID UUID,
    IN p_RoleID UUID,
    IN p_CanRead BOOLEAN,
    IN p_CanWrite BOOLEAN
)
RETURNS SETOF __mj."vwFileStorageAccountPermissions" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."FileStorageAccountPermission"
    SET
        "FileStorageAccountID" = p_FileStorageAccountID,
        "Type" = p_Type,
        "UserID" = p_UserID,
        "RoleID" = p_RoleID,
        "CanRead" = p_CanRead,
        "CanWrite" = p_CanWrite
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwFileStorageAccountPermissions" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwFileStorageAccountPermissions" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteFileStorageAccountPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."FileStorageAccountPermission"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateInstanceConfiguration"(
    IN p_ID UUID DEFAULT NULL,
    IN p_FeatureKey VARCHAR(200) DEFAULT NULL,
    IN p_Value TEXT DEFAULT NULL,
    IN p_ValueType VARCHAR(20) DEFAULT NULL,
    IN p_Category VARCHAR(100) DEFAULT NULL,
    IN p_DisplayName VARCHAR(200) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DefaultValue TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwInstanceConfigurations" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."InstanceConfiguration"
            (
                "ID",
                "FeatureKey",
                "Value",
                "ValueType",
                "Category",
                "DisplayName",
                "Description",
                "DefaultValue"
            )
        VALUES
            (
                p_ID,
                p_FeatureKey,
                p_Value,
                COALESCE(p_ValueType, 'boolean'),
                COALESCE(p_Category, 'General'),
                p_DisplayName,
                p_Description,
                p_DefaultValue
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."InstanceConfiguration"
            (
                "FeatureKey",
                "Value",
                "ValueType",
                "Category",
                "DisplayName",
                "Description",
                "DefaultValue"
            )
        VALUES
            (
                p_FeatureKey,
                p_Value,
                COALESCE(p_ValueType, 'boolean'),
                COALESCE(p_Category, 'General'),
                p_DisplayName,
                p_Description,
                p_DefaultValue
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwInstanceConfigurations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateInstanceConfiguration"(
    IN p_ID UUID,
    IN p_FeatureKey VARCHAR(200),
    IN p_Value TEXT,
    IN p_ValueType VARCHAR(20),
    IN p_Category VARCHAR(100),
    IN p_DisplayName VARCHAR(200),
    IN p_Description TEXT,
    IN p_DefaultValue TEXT
)
RETURNS SETOF __mj."vwInstanceConfigurations" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."InstanceConfiguration"
    SET
        "FeatureKey" = p_FeatureKey,
        "Value" = p_Value,
        "ValueType" = p_ValueType,
        "Category" = p_Category,
        "DisplayName" = p_DisplayName,
        "Description" = p_Description,
        "DefaultValue" = p_DefaultValue
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwInstanceConfigurations" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwInstanceConfigurations" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteInstanceConfiguration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."InstanceConfiguration"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateSearchProvider"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DriverClass VARCHAR(500) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_SupportsPreview BOOLEAN DEFAULT NULL,
    IN p_MaxResultsOverride INTEGER DEFAULT NULL,
    IN p_ProviderConfig TEXT DEFAULT NULL,
    IN p_CredentialID UUID DEFAULT NULL,
    IN p_DisplayName VARCHAR(200) DEFAULT NULL,
    IN p_Icon VARCHAR(200) DEFAULT NULL,
    IN p_Comments TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchProviders" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SearchProvider"
            (
                "ID",
                "Name",
                "Description",
                "DriverClass",
                "Status",
                "Priority",
                "SupportsPreview",
                "MaxResultsOverride",
                "ProviderConfig",
                "CredentialID",
                "DisplayName",
                "Icon",
                "Comments"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_DriverClass,
                COALESCE(p_Status, 'Active'),
                COALESCE(p_Priority, 0),
                COALESCE(p_SupportsPreview, TRUE),
                p_MaxResultsOverride,
                p_ProviderConfig,
                p_CredentialID,
                p_DisplayName,
                p_Icon,
                p_Comments
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SearchProvider"
            (
                "Name",
                "Description",
                "DriverClass",
                "Status",
                "Priority",
                "SupportsPreview",
                "MaxResultsOverride",
                "ProviderConfig",
                "CredentialID",
                "DisplayName",
                "Icon",
                "Comments"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_DriverClass,
                COALESCE(p_Status, 'Active'),
                COALESCE(p_Priority, 0),
                COALESCE(p_SupportsPreview, TRUE),
                p_MaxResultsOverride,
                p_ProviderConfig,
                p_CredentialID,
                p_DisplayName,
                p_Icon,
                p_Comments
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSearchProviders" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateSearchProvider"(
    IN p_ID UUID,
    IN p_Name VARCHAR(200),
    IN p_Description TEXT,
    IN p_DriverClass VARCHAR(500),
    IN p_Status VARCHAR(20),
    IN p_Priority INTEGER,
    IN p_SupportsPreview BOOLEAN,
    IN p_MaxResultsOverride INTEGER,
    IN p_ProviderConfig TEXT,
    IN p_CredentialID UUID,
    IN p_DisplayName VARCHAR(200),
    IN p_Icon VARCHAR(200),
    IN p_Comments TEXT
)
RETURNS SETOF __mj."vwSearchProviders" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SearchProvider"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DriverClass" = p_DriverClass,
        "Status" = p_Status,
        "Priority" = p_Priority,
        "SupportsPreview" = p_SupportsPreview,
        "MaxResultsOverride" = p_MaxResultsOverride,
        "ProviderConfig" = p_ProviderConfig,
        "CredentialID" = p_CredentialID,
        "DisplayName" = p_DisplayName,
        "Icon" = p_Icon,
        "Comments" = p_Comments
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSearchProviders" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSearchProviders" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteSearchProvider"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SearchProvider"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ===================== Triggers =====================

CREATE OR REPLACE FUNCTION __mj."trgUpdateApplicationEntity_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateApplicationEntity" ON __mj."ApplicationEntity";
CREATE TRIGGER "trgUpdateApplicationEntity"
    BEFORE UPDATE ON __mj."ApplicationEntity"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateApplicationEntity_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntity_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntity" ON __mj."Entity";
CREATE TRIGGER "trgUpdateEntity"
    BEFORE UPDATE ON __mj."Entity"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntity_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityFieldValue_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityFieldValue" ON __mj."EntityFieldValue";
CREATE TRIGGER "trgUpdateEntityFieldValue"
    BEFORE UPDATE ON __mj."EntityFieldValue"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityFieldValue_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityField_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityField" ON __mj."EntityField";
CREATE TRIGGER "trgUpdateEntityField"
    BEFORE UPDATE ON __mj."EntityField"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityField_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateFileStorageAccount_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateFileStorageAccount" ON __mj."FileStorageAccount";
CREATE TRIGGER "trgUpdateFileStorageAccount"
    BEFORE UPDATE ON __mj."FileStorageAccount"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateFileStorageAccount_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateFileStorageAccountPermission_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateFileStorageAccountPermission" ON __mj."FileStorageAccountPermission";
CREATE TRIGGER "trgUpdateFileStorageAccountPermission"
    BEFORE UPDATE ON __mj."FileStorageAccountPermission"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateFileStorageAccountPermission_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateInstanceConfiguration_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateInstanceConfiguration" ON __mj."InstanceConfiguration";
CREATE TRIGGER "trgUpdateInstanceConfiguration"
    BEFORE UPDATE ON __mj."InstanceConfiguration"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateInstanceConfiguration_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSearchProvider_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSearchProvider" ON __mj."SearchProvider";
CREATE TRIGGER "trgUpdateSearchProvider"
    BEFORE UPDATE ON __mj."SearchProvider"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSearchProvider_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

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
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '14b62084-d683-487e-a939-d63af61ad31f',
         'MJ: File Storage Account Permissions',
         'File Storage Account Permissions',
         'Controls which users and roles can access specific file storage accounts. If no permission records exist for an account, it is accessible to everyone (backwards compatible).',
         NULL,
         'FileStorageAccountPermission',
         'vwFileStorageAccountPermissions',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: File Storage Account Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '14b62084-d683-487e-a939-d63af61ad31f', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: File Storage Account Permissions for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('14b62084-d683-487e-a939-d63af61ad31f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: File Storage Account Permissions for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('14b62084-d683-487e-a939-d63af61ad31f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: File Storage Account Permissions for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('14b62084-d683-487e-a939-d63af61ad31f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Instance Configurations */

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
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '33c4f895-3313-4da7-91e3-9d30ad19f4cd',
         'MJ: Instance Configurations',
         'Instance Configurations',
         'Instance-level feature toggles and configuration. Controls which features are enabled per MJ Explorer deployment.',
         NULL,
         'InstanceConfiguration',
         'vwInstanceConfigurations',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Instance Configurations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '33c4f895-3313-4da7-91e3-9d30ad19f4cd', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Instance Configurations for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('33c4f895-3313-4da7-91e3-9d30ad19f4cd', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Instance Configurations for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('33c4f895-3313-4da7-91e3-9d30ad19f4cd', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Instance Configurations for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('33c4f895-3313-4da7-91e3-9d30ad19f4cd', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Search Providers */

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
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'c6923fa5-3f3d-4756-a2d8-e57125af450f',
         'MJ: Search Providers',
         'Search Providers',
         NULL,
         NULL,
         'SearchProvider',
         'vwSearchProviders',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Search Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c6923fa5-3f3d-4756-a2d8-e57125af450f', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Search Providers for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c6923fa5-3f3d-4756-a2d8-e57125af450f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Search Providers for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c6923fa5-3f3d-4756-a2d8-e57125af450f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Search Providers for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c6923fa5-3f3d-4756-a2d8-e57125af450f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."InstanceConfiguration" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."InstanceConfiguration" */
UPDATE __mj."InstanceConfiguration" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."InstanceConfiguration" */
ALTER TABLE __mj."InstanceConfiguration" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."InstanceConfiguration"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."InstanceConfiguration" */
UPDATE __mj."InstanceConfiguration" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."InstanceConfiguration" */
ALTER TABLE __mj."InstanceConfiguration" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."InstanceConfiguration"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."FileStorageAccountPermission" */
UPDATE __mj."FileStorageAccountPermission" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."FileStorageAccountPermission" */
ALTER TABLE __mj."FileStorageAccountPermission" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."FileStorageAccountPermission"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."FileStorageAccountPermission" */
UPDATE __mj."FileStorageAccountPermission" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."FileStorageAccountPermission" */
ALTER TABLE __mj."FileStorageAccountPermission" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."FileStorageAccountPermission"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchProvider" */
UPDATE __mj."SearchProvider" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchProvider" */
ALTER TABLE __mj."SearchProvider" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchProvider"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchProvider" */
UPDATE __mj."SearchProvider" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchProvider" */
ALTER TABLE __mj."SearchProvider" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchProvider"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a261204e-3866-41b3-92eb-784c74d2f906' OR ("EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'UserSearchPredicateAPI')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a261204e-3866-41b3-92eb-784c74d2f906',
        'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Fields"
        100132,
        'UserSearchPredicateAPI',
        'User Search Predicate API',
        'Search predicate controlling how user search queries match against this field. Valid values: BeginsWith, Contains, EndsWith, Exact.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Contains',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '292a1bed-3ca2-4c24-8b8e-cab2a4b2125c' OR ("EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AutoUpdateUserSearchPredicate')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '292a1bed-3ca2-4c24-8b8e-cab2a4b2125c',
        'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Fields"
        100133,
        'AutoUpdateUserSearchPredicate',
        'Auto Update User Search Predicate',
        'When true, CodeGen LLM can auto-set the UserSearchPredicateAPI value during code generation runs.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c3caf473-d086-44cf-ad6c-99a5cca926dd' OR ("EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AutoUpdateFullTextSearch')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'c3caf473-d086-44cf-ad6c-99a5cca926dd',
        'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Fields"
        100134,
        'AutoUpdateFullTextSearch',
        'Auto Update Full Text Search',
        'When true, CodeGen LLM can auto-set the FullTextSearchEnabled value during code generation runs.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '58a3a9f6-ee7a-409f-bf3d-ad34c153b84a' OR ("EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AutoUpdateExtendedType')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '58a3a9f6-ee7a-409f-bf3d-ad34c153b84a',
        'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Fields"
        100135,
        'AutoUpdateExtendedType',
        'Auto Update Extended Type',
        'When true (default), CodeGen can automatically suggest and apply ExtendedType values (GeoLatitude, GeoLongitude, GeoAddress, etc.) during LLM field categorization. Set to 0 to lock admin-specified ExtendedType.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '788d2007-4088-405b-98cd-056b376dd4e1' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AutoUpdateFullTextSearch')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '788d2007-4088-405b-98cd-056b376dd4e1',
        'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entities"
        100123,
        'AutoUpdateFullTextSearch',
        'Auto Update Full Text Search',
        'When true, CodeGen LLM can auto-configure full-text search settings (FullTextSearchEnabled, catalog, index, function) during code generation runs.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5371af90-dcf3-44c3-990b-95c29b088f0c' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AutoUpdateAllowUserSearchAPI')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '5371af90-dcf3-44c3-990b-95c29b088f0c',
        'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entities"
        100124,
        'AutoUpdateAllowUserSearchAPI',
        'Auto Update Allow User Search API',
        'When true, CodeGen LLM can auto-set AllowUserSearchAPI during code generation runs.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '928ff8e1-3c3f-4a9d-afcc-66808d59c151' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'TrustServerCacheCompletely')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '928ff8e1-3c3f-4a9d-afcc-66808d59c151',
        'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entities"
        100125,
        'TrustServerCacheCompletely',
        'Trust Server Cache Completely',
        'When true (default), the server-side RunView cache will store and return cached results for this entity, trusting that all mutations flow through BaseEntity."Save"() which fires cache invalidation events. Set to false for entities whose rows are created as side-effects of other operations via raw SQL (e.g., Record Changes created by spCreateRecordChange_Internal), since those inserts bypass BaseEntity and never trigger cache invalidation.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '886c982a-13b1-4ee2-8c89-a96b995bad5d' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SupportsGeoCoding')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '886c982a-13b1-4ee2-8c89-a96b995bad5d',
        'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entities"
        100126,
        'SupportsGeoCoding',
        'Supports Geo Coding',
        'When true, CodeGen generates geo-aware subclass code, adds __mj_Latitude/__mj_Longitude virtual fields to the base view, and the UI shows a map view toggle. Auto-set by CodeGen when LLM detects geo-capable fields (address, lat/lng, etc.).',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a70e1dba-0077-49ca-aec4-cee1203d3946' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AutoUpdateSupportsGeoCoding')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a70e1dba-0077-49ca-aec4-cee1203d3946',
        'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entities"
        100127,
        'AutoUpdateSupportsGeoCoding',
        'Auto Update Supports Geo Coding',
        'When true (default), CodeGen can automatically set SupportsGeoCoding based on LLM analysis of entity fields. Set to 0 to lock the value and prevent CodeGen from changing it.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cb71b885-cf35-4ab8-9649-fdf0a2696f44' OR ("EntityID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND "Name" = 'ID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'cb71b885-cf35-4ab8-9649-fdf0a2696f44',
        '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- "Entity": "MJ": "Instance" "Configurations"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd2bde8d7-a171-4eb3-9c70-1e6294b9105f' OR ("EntityID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND "Name" = 'FeatureKey')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd2bde8d7-a171-4eb3-9c70-1e6294b9105f',
        '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- "Entity": "MJ": "Instance" "Configurations"
        100002,
        'FeatureKey',
        'Feature Key',
        'Unique dot-notation key identifying the feature, e.g. Shell."SearchBar"."Enabled".',
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a99fe155-6749-457d-8f1c-3a35d944e2da' OR ("EntityID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND "Name" = 'Value')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a99fe155-6749-457d-8f1c-3a35d944e2da',
        '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- "Entity": "MJ": "Instance" "Configurations"
        100003,
        'Value',
        'Value',
        'Current value for this feature setting.',
        'TEXT',
        -1,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3fba3d85-4e47-49f9-a262-4aaba9232c96' OR ("EntityID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND "Name" = 'ValueType')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '3fba3d85-4e47-49f9-a262-4aaba9232c96',
        '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- "Entity": "MJ": "Instance" "Configurations"
        100004,
        'ValueType',
        'Value Type',
        'Data type of the value: boolean, string, number, or json.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'boolean',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6c3a6973-be4c-4d3e-8605-3fa5eea73c76' OR ("EntityID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND "Name" = 'Category')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '6c3a6973-be4c-4d3e-8605-3fa5eea73c76',
        '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- "Entity": "MJ": "Instance" "Configurations"
        100005,
        'Category',
        'Category',
        'Grouping category for admin UI display.',
        'TEXT',
        200,
        0,
        0,
        FALSE,
        'General',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a3d474c6-e6da-4c19-9829-0e63524374eb' OR ("EntityID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND "Name" = 'DisplayName')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a3d474c6-e6da-4c19-9829-0e63524374eb',
        '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- "Entity": "MJ": "Instance" "Configurations"
        100006,
        'DisplayName',
        'Display Name',
        'Human-readable display name for the setting.',
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd4142b87-219d-4a43-b9a0-9c24c65c2f41' OR ("EntityID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND "Name" = 'Description')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd4142b87-219d-4a43-b9a0-9c24c65c2f41',
        '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- "Entity": "MJ": "Instance" "Configurations"
        100007,
        'Description',
        'Description',
        'Optional extended description or help text for the setting.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '106b981d-9dd9-4707-a90f-e45cea1829f5' OR ("EntityID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND "Name" = 'DefaultValue')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '106b981d-9dd9-4707-a90f-e45cea1829f5',
        '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- "Entity": "MJ": "Instance" "Configurations"
        100008,
        'DefaultValue',
        'Default Value',
        'Factory default value. Used when resetting to defaults.',
        'TEXT',
        -1,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '716a7406-1e2e-42e2-9752-064c76f387bc' OR ("EntityID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND "Name" = '__mj_CreatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '716a7406-1e2e-42e2-9752-064c76f387bc',
        '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- "Entity": "MJ": "Instance" "Configurations"
        100009,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd1107233-4dcc-45ab-be90-990d5a5d51bb' OR ("EntityID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND "Name" = '__mj_UpdatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd1107233-4dcc-45ab-be90-990d5a5d51bb',
        '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- "Entity": "MJ": "Instance" "Configurations"
        100010,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8ae710d5-bdaa-4199-a3c2-40d6ae691427' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = 'ID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '8ae710d5-bdaa-4199-a3c2-40d6ae691427',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1f809cd8-8a92-495c-825e-b43c1d88ea48' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = 'FileStorageAccountID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1f809cd8-8a92-495c-825e-b43c1d88ea48',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100002,
        'FileStorageAccountID',
        'File Storage Account ID',
        'The storage account this permission applies to.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fe2ac7bc-5f6d-462d-a09b-a66bd1854476' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = 'Type')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'fe2ac7bc-5f6d-462d-a09b-a66bd1854476',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100003,
        'Type',
        'Type',
        'Permission type: User (requires UserID), Role (requires RoleID), or Everyone (both NULL).',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Role',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a73293c1-fb0d-4900-a60b-74f947d02b59' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = 'UserID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a73293c1-fb0d-4900-a60b-74f947d02b59',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100004,
        'UserID',
        'User ID',
        'Required when Type is User. The specific user granted access to this storage account.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'E1238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1f340cfc-f345-42c0-992e-b01515f473ff' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = 'RoleID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1f340cfc-f345-42c0-992e-b01515f473ff',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100005,
        'RoleID',
        'Role ID',
        'Required when Type is Role. The role granted access to this storage account.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'DA238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '62f5ffe5-fd80-4760-a498-ea0bbd8c30b9' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = 'CanRead')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '62f5ffe5-fd80-4760-a498-ea0bbd8c30b9',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100006,
        'CanRead',
        'Can Read',
        'Whether the grantee can read/search files in this storage account.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ba33aa2e-a18e-48e6-a7c3-32a51b489b16' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = 'CanWrite')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'ba33aa2e-a18e-48e6-a7c3-32a51b489b16',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100007,
        'CanWrite',
        'Can Write',
        'Whether the grantee can upload/modify files in this storage account.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'faea9e50-5f21-4bdf-b1f9-c7a114be8795' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = '__mj_CreatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'faea9e50-5f21-4bdf-b1f9-c7a114be8795',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100008,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cbd51c2b-1434-4656-b354-232629f3ea65' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = '__mj_UpdatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'cbd51c2b-1434-4656-b354-232629f3ea65',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100009,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e2f5b8cc-d154-4554-bca5-5487e00a7653' OR ("EntityID" = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND "Name" = 'IncludeInGlobalSearch')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e2f5b8cc-d154-4554-bca5-5487e00a7653',
        '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', -- "Entity": "MJ": "File" "Storage" "Accounts"
        100017,
        'IncludeInGlobalSearch',
        'Include In Global Search',
        'When true, this storage account is included in universal/global search results. Only effective if the associated provider supports search (SupportsSearch = 1).',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '01d75fe9-0677-4dd0-9b17-7d87a6aa2545' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'ID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '01d75fe9-0677-4dd0-9b17-7d87a6aa2545',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2f1ee105-22ac-4e15-bc79-50c1a2cb5a0e' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'Name')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '2f1ee105-22ac-4e15-bc79-50c1a2cb5a0e',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100002,
        'Name',
        'Name',
        'Display name for this search provider (e.g., "Vector Search", "Algolia")',
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        TRUE,
        TRUE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c693032c-02c8-43ad-9f0c-91b0d8c5246f' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'Description')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'c693032c-02c8-43ad-9f0c-91b0d8c5246f',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100003,
        'Description',
        'Description',
        'Human-readable description of what this provider searches and how it works',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b57c3774-e6b4-4fe3-934f-2853228b7571' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'DriverClass')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'b57c3774-e6b4-4fe3-934f-2853228b7571',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100004,
        'DriverClass',
        'Driver Class',
        'ClassFactory key used with @RegisterClass(ISearchProvider, DriverClass) to instantiate the provider at runtime',
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '38eb0b5a-78bd-4318-ac30-6243d7754d7b' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'Status')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '38eb0b5a-78bd-4318-ac30-6243d7754d7b',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100005,
        'Status',
        'Status',
        'Provider lifecycle status: Pending (not yet activated), Active (in use), Terminated (disabled)',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Active',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5606aa9e-2d13-4421-bae1-76517dd83aa2' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'Priority')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '5606aa9e-2d13-4421-bae1-76517dd83aa2',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100006,
        'Priority',
        'Priority',
        'Execution priority (lower = higher priority). Controls provider ordering and can influence RRF weighting. Must be >= 0.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7196fc12-55e7-4d8e-8b14-75fbbde2a38e' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'SupportsPreview')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '7196fc12-55e7-4d8e-8b14-75fbbde2a38e',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100007,
        'SupportsPreview',
        'Supports Preview',
        'Whether this provider should run during fast preview/autocomplete searches. Expensive providers (external APIs) may set this to 0.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a1393f82-28ec-4b51-8948-cfbe4a01daa6' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'MaxResultsOverride')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a1393f82-28ec-4b51-8948-cfbe4a01daa6',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100008,
        'MaxResultsOverride',
        'Max Results Override',
        'Optional per-provider cap on the number of results to return. Useful for rate-limited or pay-per-query external APIs. When NULL, uses the SearchEngine default.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '975cd5ae-a9fa-4888-80f4-1506c585b7bb' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'ProviderConfig')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '975cd5ae-a9fa-4888-80f4-1506c585b7bb',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100009,
        'ProviderConfig',
        'Provider Config',
        'Optional JSON configuration blob for provider-specific settings (e.g., API endpoints, index names, tuning parameters). Schema is provider-defined.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '431e42e5-21e4-4f24-a486-46982d2ab695' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'CredentialID')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '431e42e5-21e4-4f24-a486-46982d2ab695',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100010,
        'CredentialID',
        'Credential ID',
        'Optional FK to the Credential entity for providers that require authentication (e.g., Algolia API key, external service credentials)',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '20511d87-40f5-4a9d-8833-3ffe61d04916' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'DisplayName')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '20511d87-40f5-4a9d-8833-3ffe61d04916',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100011,
        'DisplayName',
        'Display Name',
        'UI display name for this provider shown in filter facets and result grouping (e.g., "Database", "Semantic Search"). When NULL, falls back to the Name column.',
        'TEXT',
        400,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fcd58c1f-7a00-4fe8-bf07-d10c0fe3e95b' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'Icon')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'fcd58c1f-7a00-4fe8-bf07-d10c0fe3e95b',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100012,
        'Icon',
        'Icon',
        'CSS icon class for UI display in filter facets and result badges (e.g., "fa-solid fa-database", "fa-solid fa-brain"). Supports any CSS-based icon library. When NULL, a default icon is used.',
        'TEXT',
        400,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cc1b35c6-7b04-47f3-b564-85fb92e46c2b' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'Comments')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'cc1b35c6-7b04-47f3-b564-85fb92e46c2b',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100013,
        'Comments',
        'Comments',
        'Free-form notes about this provider configuration',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e64dab70-3fd4-4312-821e-a2d6e56c7870' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = '__mj_CreatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e64dab70-3fd4-4312-821e-a2d6e56c7870',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100014,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '854d8a7c-b071-4ab7-a9c2-c10efbcfba57' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = '__mj_UpdatedAt')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '854d8a7c-b071-4ab7-a9c2-c10efbcfba57',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100015,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d8dbb0dc-44d0-4680-b336-71394f02963a', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 5, 'GeoAddress', 'GeoAddress', NOW(), NOW());
/* SQL text to insert entity field value with ID e9e3aea7-9f3c-47c8-9ce2-5fdf64d34acf */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e9e3aea7-9f3c-47c8-9ce2-5fdf64d34acf', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 6, 'GeoCity', 'GeoCity', NOW(), NOW());
/* SQL text to insert entity field value with ID afae0954-1959-46d7-ad86-7b042bfbaebb */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('afae0954-1959-46d7-ad86-7b042bfbaebb', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 7, 'GeoCountry', 'GeoCountry', NOW(), NOW());
/* SQL text to insert entity field value with ID 38d62f4e-338a-4bf2-b1a6-16106fa0fa01 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('38d62f4e-338a-4bf2-b1a6-16106fa0fa01', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 8, 'GeoLatitude', 'GeoLatitude', NOW(), NOW());
/* SQL text to insert entity field value with ID 7e3f3656-ad62-4294-a3a9-2ea254c91269 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('7e3f3656-ad62-4294-a3a9-2ea254c91269', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 9, 'GeoLongitude', 'GeoLongitude', NOW(), NOW());
/* SQL text to insert entity field value with ID b6d14033-c479-4167-b075-e2796f8a159d */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('b6d14033-c479-4167-b075-e2796f8a159d', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 10, 'GeoPostalCode', 'GeoPostalCode', NOW(), NOW());
/* SQL text to insert entity field value with ID d2054017-412b-457a-a98e-aa2400128bad */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d2054017-412b-457a-a98e-aa2400128bad', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 11, 'GeoStateProvince', 'GeoStateProvince', NOW(), NOW());
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=12 WHERE "ID"='F45F1816-CAAA-434C-8239-3932D448DEB6';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=13 WHERE "ID"='68A4F7CA-B203-40C8-ABAC-A91122866B00';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=14 WHERE "ID"='DFD25989-75AD-4F5B-8F18-88E687E067E5';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=15 WHERE "ID"='7758B42A-D133-4052-9991-1869AA5DFD74';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=16 WHERE "ID"='5B3460FB-56CC-4DAB-8375-60BDCD11FE35';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=17 WHERE "ID"='E1D0D56C-10D6-4A7C-BED8-D4F7A439204D';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=18 WHERE "ID"='A5865195-4AD1-432D-8797-57D25F3741FF';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=19 WHERE "ID"='356C61B4-27B5-48F3-A240-31B0CC6CA23D';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=20 WHERE "ID"='45F07992-2974-4F4B-A5C8-FAECCF86BDB9';
/* SQL text to insert entity field value with ID 3146f90e-0e7f-40e1-8794-f731366686f1 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('3146f90e-0e7f-40e1-8794-f731366686f1', 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476', 1, 'Everyone', 'Everyone', NOW(), NOW());
/* SQL text to insert entity field value with ID 707f0986-3a6c-4964-93c7-3db87f9e88e7 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('707f0986-3a6c-4964-93c7-3db87f9e88e7', 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476', 2, 'Role', 'Role', NOW(), NOW());
/* SQL text to insert entity field value with ID 28b67d40-9c5a-4394-8cf3-84313c3beeaa */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('28b67d40-9c5a-4394-8cf3-84313c3beeaa', 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476', 3, 'User', 'User', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID FE2AC7BC-5F6D-462D-A09B-A66BD1854476 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='FE2AC7BC-5F6D-462D-A09B-A66BD1854476';
/* SQL text to insert entity field value with ID 92cbba12-3e5d-4e82-8f84-abf09841b98a */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('92cbba12-3e5d-4e82-8f84-abf09841b98a', '3FBA3D85-4E47-49F9-A262-4AABA9232C96', 1, 'boolean', 'boolean', NOW(), NOW());
/* SQL text to insert entity field value with ID 7651d9d0-d810-4c76-b21b-9aad9ea10d54 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('7651d9d0-d810-4c76-b21b-9aad9ea10d54', '3FBA3D85-4E47-49F9-A262-4AABA9232C96', 2, 'json', 'json', NOW(), NOW());
/* SQL text to insert entity field value with ID 62b9a5b6-39fc-4b0f-8b57-feae68e675f3 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('62b9a5b6-39fc-4b0f-8b57-feae68e675f3', '3FBA3D85-4E47-49F9-A262-4AABA9232C96', 3, 'number', 'number', NOW(), NOW());
/* SQL text to insert entity field value with ID 55fac5ae-b8bd-47b8-9168-32b6cb5556ea */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('55fac5ae-b8bd-47b8-9168-32b6cb5556ea', '3FBA3D85-4E47-49F9-A262-4AABA9232C96', 4, 'string', 'string', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 3FBA3D85-4E47-49F9-A262-4AABA9232C96 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='3FBA3D85-4E47-49F9-A262-4AABA9232C96';
/* SQL text to insert entity field value with ID 0187904a-0ba9-4fea-859a-632a4a189f0e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('0187904a-0ba9-4fea-859a-632a4a189f0e', '38EB0B5A-78BD-4318-AC30-6243D7754D7B', 1, 'Active', 'Active', NOW(), NOW());
/* SQL text to insert entity field value with ID 4f91f3f9-806d-4ae3-88d2-a6274cf51e9f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('4f91f3f9-806d-4ae3-88d2-a6274cf51e9f', '38EB0B5A-78BD-4318-AC30-6243D7754D7B', 2, 'Pending', 'Pending', NOW(), NOW());
/* SQL text to insert entity field value with ID 6c21fc66-1dcc-4c3f-ab80-9b1bf9efc661 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('6c21fc66-1dcc-4c3f-ab80-9b1bf9efc661', '38EB0B5A-78BD-4318-AC30-6243D7754D7B', 3, 'Terminated', 'Terminated', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 38EB0B5A-78BD-4318-AC30-6243D7754D7B */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='38EB0B5A-78BD-4318-AC30-6243D7754D7B';
/* Create Entity Relationship: MJ: Roles -> MJ: File Storage Account Permissions (One To Many via RoleID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'fdb5ba5f-1e07-4bb8-8439-c14f7f4bea7c'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('fdb5ba5f-1e07-4bb8-8439-c14f7f4bea7c', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '14B62084-D683-487E-A939-D63AF61AD31F', 'RoleID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ce674f35-e1b1-46e3-81e4-ecfb86e61b69'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('ce674f35-e1b1-46e3-81e4-ecfb86e61b69', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '14B62084-D683-487E-A939-D63AF61AD31F', 'UserID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5e1c0afa-9a3b-453f-ba31-b1b499491297'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('5e1c0afa-9a3b-453f-ba31-b1b499491297', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'C6923FA5-3F3D-4756-A2D8-E57125AF450F', 'CredentialID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '1e130a27-246a-4215-aa1b-f1ba7badc7bc'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('1e130a27-246a-4215-aa1b-f1ba7badc7bc', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', '14B62084-D683-487E-A939-D63AF61AD31F', 'FileStorageAccountID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a5b70913-c4af-4cf1-ae6f-931cd3614203' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = 'FileStorageAccount')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a5b70913-c4af-4cf1-ae6f-931cd3614203',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100019,
        'FileStorageAccount',
        'File Storage Account',
        NULL,
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6c491c08-2a0f-483e-92b2-262a948d7c47' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = 'User')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '6c491c08-2a0f-483e-92b2-262a948d7c47',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100020,
        'User',
        'User',
        NULL,
        'TEXT',
        200,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b8bc2eac-413e-468c-80f6-6e157134ad23' OR ("EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F' AND "Name" = 'Role')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'b8bc2eac-413e-468c-80f6-6e157134ad23',
        '14B62084-D683-487E-A939-D63AF61AD31F', -- "Entity": "MJ": "File" "Storage" "Account" "Permissions"
        100021,
        'Role',
        'Role',
        NULL,
        'TEXT',
        100,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd41e3892-8d33-4998-81d2-632caa6f22cf' OR ("EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND "Name" = 'Credential')
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
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd41e3892-8d33-4998-81d2-632caa6f22cf',
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- "Entity": "MJ": "Search" "Providers"
        100031,
        'Credential',
        'Credential',
        NULL,
        'TEXT',
        400,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C24D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'C34D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'C44D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '204F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '514F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A94217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '514F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '834D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'A94217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '584D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '584D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '584D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '594D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'A5B70913-C4AF-4CF1-AE6F-931CD3614203'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '6C491C08-2A0F-483E-92B2-262A948D7C47'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'B8BC2EAC-413E-468C-80F6-6E157134AD23'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '62F5FFE5-FD80-4760-A498-EA0BBD8C30B9'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'BA33AA2E-A18E-48E6-A7C3-32A51B489B16'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A5B70913-C4AF-4CF1-AE6F-931CD3614203'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '6C491C08-2A0F-483E-92B2-262A948D7C47'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B8BC2EAC-413E-468C-80F6-6E157134AD23'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'A5B70913-C4AF-4CF1-AE6F-931CD3614203'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '6C491C08-2A0F-483E-92B2-262A948D7C47'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'B8BC2EAC-413E-468C-80F6-6E157134AD23'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '84C51291-65AB-4677-A0B6-5DACD698A255'
               AND "AutoUpdateDefaultInView" = TRUE;
/* Set categories for 12 fields */
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8AE710D5-BDAA-4199-A3C2-40D6AE691427' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions."FileStorageAccountID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Permissions',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Storage Account',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1F809CD8-8A92-495C-825E-B43C1D88EA48' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions."FileStorageAccount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Permissions',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Storage Account Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A5B70913-C4AF-4CF1-AE6F-931CD3614203' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions."CanRead"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Permissions',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '62F5FFE5-FD80-4760-A498-EA0BBD8C30B9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions."CanWrite"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Permissions',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BA33AA2E-A18E-48E6-A7C3-32A51B489B16' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions."Type"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Grantee Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Permission Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions."UserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Grantee Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A73293C1-FB0D-4900-A60B-74F947D02B59' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions."User"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Grantee Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C491C08-2A0F-483E-92B2-262A948D7C47' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions."RoleID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Grantee Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Role',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1F340CFC-F345-42C0-992E-B01515F473FF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions."Role"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Grantee Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Role Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B8BC2EAC-413E-468C-80F6-6E157134AD23' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FAEA9E50-5F21-4BDF-B1F9-C7A114BE8795' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CBD51C2B-1434-4656-B354-232629F3EA65' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-shield-alt */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-shield-alt', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '14B62084-D683-487E-A939-D63AF61AD31F';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('c19cde13-37fb-466b-9a9f-2cb0c8ae331a', '14B62084-D683-487E-A939-D63AF61AD31F', 'FieldCategoryInfo', '{"Grantee Information":{"icon":"fa fa-user-lock","description":"Details regarding the user, role, or group to whom the permission is being granted."},"Account Permissions":{"icon":"fa fa-key","description":"The target storage account and the specific read/write access levels assigned to the grantee."},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps for tracking record changes."}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('d76fe517-b5c9-44ac-8804-a521ad85969e', '14B62084-D683-487E-A939-D63AF61AD31F', 'FieldCategoryIcons', '{"Grantee Information":"fa fa-user-lock","Account Permissions":"fa fa-key","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '14B62084-D683-487E-A939-D63AF61AD31F';
/* Set categories for 76 fields */
-- UPDATE Entity Field Category Info MJ: Entity Fields."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '414D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."EntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FA5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsPrimaryKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '754317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsUnique"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoIncrement"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '045817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsVirtual"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '075817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsSoftPrimaryKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F31790E1-FAA3-425A-B020-AEACAFCB2B6E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsSoftForeignKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5203089E-9FFC-4BB7-B23C-91F2555504D1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."FieldCodeName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '07AD23D5-DEBD-4657-8E3C-7F1F1342BCE3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Sequence"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FB5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."DisplayName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FE5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateDescription"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '044417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."DefaultInView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '065817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."ViewCellTemplate"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F34217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."DefaultColumnWidth"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AllowUpdateInView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F44217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IncludeInGeneratedForm"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F54217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."GeneratedFormSection"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F64217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityDisplayType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F05717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."ScopeDefault"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0C2449FB-1BDA-4BE9-A059-7224C05A14B9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateDisplayName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8486168A-5082-48DC-BE13-EF53F49922CB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Data Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FF5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Length"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '005817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Precision"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '015817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Scale"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '025817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AllowsNull"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '035817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."DefaultValue"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D74217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."ValueListType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C64D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."ExtendedType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '055817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."CodeType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B04C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AllowUpdateAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '404F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IncludeInUserSearchAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Include In User Search',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '424F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."FullTextSearchEnabled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5E4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."UserSearchParamFormatAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Param Format',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '434F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IsNameField"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B64217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateIncludeInUserSearchAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto Update Search Inclusion',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9E1D732F-E33E-40FE-AFAD-477623AC9DEA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."JSONType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Data Constraints & Validation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D97C0BEC-3B59-4BA2-BAB5-432944AD257B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."JSONTypeIsArray"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Data Constraints & Validation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B94F8690-5226-48A9-9C89-4549F141FBB7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."JSONTypeDefinition"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Data Constraints & Validation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'TypeScript'
WHERE 
   "ID" = '1187C2FF-0226-4790-8D0D-036D9F8A15C1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."UserSearchPredicateAPI"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Data Constraints & Validation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Search Predicate',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A261204E-3866-41B3-92EB-784C74D2F906' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '954D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityFieldName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity Field',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B74217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."IncludeRelatedEntityNameFieldInBaseView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Include Related Name In View',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '974D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityNameFieldMap"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity Name Map',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F74217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."EntityIDFieldName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '35A18EA5-5641-EF11-86C3-00224821D189' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateRelatedEntityInfo"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto Update Related Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FFC3C691-2E33-46D0-B11C-AB348997E08C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityJoinFields"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EE0B81ED-767A-4BCE-9E6E-E4E48711B482' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B84217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntitySchemaName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity Schema',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9B4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityBaseTable"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity Table',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityBaseView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Entity View',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityCodeName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."RelatedEntityClassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CE5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CF5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."ValuesToPackWithSchema"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '20818E34-47E7-4371-A51E-3D29BCC4B4B8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '407A96C8-580A-4427-BEED-ABB46F015586' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateIsNameField"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5EFD956B-0DB1-491B-9153-0891A7B1835D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateDefaultInView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E9707755-1A43-4DE3-815D-37E41CA7C7D0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateCategory"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D64DD327-8057-4DF5-A24C-F951932C1A26' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Entity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '584D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."SchemaName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."BaseTable"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '594D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."BaseView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5A4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."EntityCodeName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A04D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."EntityClassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B94217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateUserSearchPredicate"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System & Audit Metadata',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto Update Search Predicate',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '292A1BED-3CA2-4C24-8B8E-CAB2A4B2125C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateFullTextSearch"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System & Audit Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C3CAF473-D086-44CF-AD6C-99A5CCA926DD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AutoUpdateExtendedType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System & Audit Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '58A3A9F6-EE7A-409F-BF3D-AD34C153B84A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."Encrypt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '04C52058-4E01-4316-ABAE-9958AFB71B5C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."EncryptionKeyID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B24D31A6-A3BE-449C-9FE7-98C87E40DA55' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."AllowDecryptInAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7C097F3D-79AC-4144-A3B6-A8BFF64EDF3C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Fields."SendEncryptedValue"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '901EE131-BC99-4B80-B5E5-D974057EEA8A' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 69 fields */
-- UPDATE Entity Field Category Info MJ: Entities."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '195817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."ParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."NameSuffix"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '164E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."BaseTable"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '554D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."BaseView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '564D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."BaseViewGenerated"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '964D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."SchemaName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '574D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."VirtualEntity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5F4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."DisplayName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AllowMultipleSubtypes"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '18B53A1B-EE59-4382-B902-85BAC79BCED0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."CodeName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."ClassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."BaseTableCodeName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AC4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."ParentEntity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1D5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."ParentBaseTable"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1E5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."ParentBaseView"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1F5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."RelationshipDefaultDisplayType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Relationship Display Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F75817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."UserFormGenerated"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9A4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."EntityObjectSubclassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Subclass Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D84217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."EntityObjectSubclassImport"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Subclass Import Path',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4F4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."SupportsGeoCoding"

UPDATE __mj."EntityField"
SET 
   "Category" = 'User Interface & Customization',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Supports Geo-Coding',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '886C982A-13B1-4EE2-8C89-A96B995BAD5D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AutoUpdateSupportsGeoCoding"

UPDATE __mj."EntityField"
SET 
   "Category" = 'User Interface & Customization',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto Update Geo-Coding',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A70E1DBA-0077-49CA-AEC4-CEE1203D3946' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AutoUpdateDescription"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F34E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."TrackRecordChanges"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B94D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AuditRecordAccess"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C74D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AuditViewRuns"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C84D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."PreferredCommunicationField"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EE4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."Icon"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B15717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B9992893-7BD7-42EA-A2A8-48928D7A5CCE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."IncludeInAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5B4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AllowAllRowsAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AllowUpdateAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '414F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AllowCreateAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AllowDeleteAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '804D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."CustomResolverAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '814D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AllowUserSearchAPI"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Allow User Search',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '444F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."FullTextSearchEnabled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Full-Text Search Enabled',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1F4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."FullTextCatalog"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Full-Text Catalog',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '204E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."FullTextCatalogGenerated"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Full-Text Catalog Generated',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '214E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."FullTextIndex"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Full-Text Index',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '224E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."FullTextIndexGenerated"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Full-Text Index Generated',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '234E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."FullTextSearchFunction"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Function',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '244E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."FullTextSearchFunctionGenerated"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Function Generated',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '254E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."UserViewMaxRows"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F84217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."ScopeDefault"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Scope',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BCA2D814-7530-48F8-9AB7-DCEF70AC5FC9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."RowsToPackWithSchema"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Rows To Pack',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C6AC9CC7-0C99-46B4-9940-C5A9E60EED0A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."RowsToPackSampleMethod"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Packing Sample Method',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EFB53FA7-D868-4E1C-9932-A5E624092DC5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."RowsToPackSampleCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Packing Sample Count',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B3B3BCB-9E96-4FB0-B2B2-93C676C43261' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."RowsToPackSampleOrder"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Packing Sample Order',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '29690283-5206-48EA-ADF6-43C40DA3220B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AutoUpdateFullTextSearch"

UPDATE __mj."EntityField"
SET 
   "Category" = 'API & Search Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto Update Search Settings',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '788D2007-4088-405B-98CD-056B376DD4E1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AutoUpdateAllowUserSearchAPI"

UPDATE __mj."EntityField"
SET 
   "Category" = 'API & Search Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Auto Update Search API',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5371AF90-DCF3-44C3-990B-95C29B088F0C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."TrustServerCacheCompletely"

UPDATE __mj."EntityField"
SET 
   "Category" = 'API & Search Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Trust Server Cache',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '928FF8E1-3C3F-4A9D-AFCC-66808D59C151' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities.spCreate

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Create Procedure',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities.spUpdate

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Update Procedure',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities.spDelete

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Delete Procedure',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities.spCreateGenerated

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Create SP Generated',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities.spUpdateGenerated

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Update SP Generated',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '904D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities.spDeleteGenerated

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Delete SP Generated',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '914D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."CascadeDeletes"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5D4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."DeleteType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '115917F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AllowRecordMerge"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '125917F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities.spMatch

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Match Procedure',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3E4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D05717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D15717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."AutoRowCountFrequency"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Refresh Frequency (Hours)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2212928A-D5D0-4AE3-8F5A-25C4DFE8C373' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."RowCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '84C51291-65AB-4677-A0B6-5DACD698A255' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entities."RowCountRunAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Last Counted At',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5A02DE6F-6D75-46B7-B800-D42B82227D1A' AND "AutoUpdateCategory" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'A3D474C6-E6DA-4C19-9829-0E63524374EB'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D2BDE8D7-A171-4EB3-9C70-1E6294B9105F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A99FE155-6749-457D-8F1C-3A35D944E2DA'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '3FBA3D85-4E47-49F9-A262-4AABA9232C96'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '6C3A6973-BE4C-4D3E-8605-3FA5EEA73C76'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A3D474C6-E6DA-4C19-9829-0E63524374EB'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'D2BDE8D7-A171-4EB3-9C70-1E6294B9105F'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '6C3A6973-BE4C-4D3E-8605-3FA5EEA73C76'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'A3D474C6-E6DA-4C19-9829-0E63524374EB'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E2F5B8CC-D154-4554-BCA5-5487E00A7653'
               AND "AutoUpdateDefaultInView" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B57C3774-E6B4-4FE3-934F-2853228B7571'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '38EB0B5A-78BD-4318-AC30-6243D7754D7B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5606AA9E-2D13-4421-BAE1-76517DD83AA2'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '20511D87-40F5-4A9D-8833-3FFE61D04916'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D41E3892-8D33-4998-81D2-632CAA6F22CF'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '38EB0B5A-78BD-4318-AC30-6243D7754D7B'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '20511D87-40F5-4A9D-8833-3FFE61D04916'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 10 fields */
-- UPDATE Entity Field Category Info MJ: Instance Configurations."FeatureKey"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Feature Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D2BDE8D7-A171-4EB3-9C70-1E6294B9105F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Instance Configurations."DisplayName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Feature Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A3D474C6-E6DA-4C19-9829-0E63524374EB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Instance Configurations."Category"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Feature Definition',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Admin Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C3A6973-BE4C-4D3E-8605-3FA5EEA73C76' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Instance Configurations."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Feature Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D4142B87-219D-4A43-B9A0-9C24C65C2F41' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Instance Configurations."Value"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Current Value',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A99FE155-6749-457D-8F1C-3A35D944E2DA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Instance Configurations."ValueType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3FBA3D85-4E47-49F9-A262-4AABA9232C96' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Instance Configurations."DefaultValue"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '106B981D-9DD9-4707-A90F-E45CEA1829F5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Instance Configurations."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CB71B885-CF35-4AB8-9649-FDF0A2696F44' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Instance Configurations.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '716A7406-1E2E-42E2-9752-064C76F387BC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Instance Configurations.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D1107233-4DCC-45AB-BE90-990D5A5D51BB' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-sliders-h */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-sliders-h', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('40d40ed6-9cc0-42d5-854b-6ae08b6c97c5', '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', 'FieldCategoryInfo', '{"Feature Definition":{"icon":"fa fa-tag","description":"Core identification, naming, and descriptive information for the feature toggle"},"Configuration Settings":{"icon":"fa fa-toggle-on","description":"Operational values, data types, and default settings for the configuration"},"System Metadata":{"icon":"fa fa-database","description":"System-managed identifiers and audit tracking timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('028adcf6-cc88-4a49-aff8-104265a4fbb6', '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', 'FieldCategoryIcons', '{"Feature Definition":"fa fa-tag","Configuration Settings":"fa fa-toggle-on","System Metadata":"fa fa-database"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD';
/* Set categories for 16 fields */
-- UPDATE Entity Field Category Info MJ: Search Providers."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '01D75FE9-0677-4DD0-9B17-7D87A6AA2545' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Identity',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F1EE105-22AC-4E15-BC79-50C1A2CB5A0E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."DisplayName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Identity',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '20511D87-40F5-4A9D-8833-3FFE61D04916' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Identity',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C693032C-02C8-43AD-9F0C-91B0D8C5246F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."Icon"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Identity',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FCD58C1F-7A00-4FE8-BF07-D10C0FE3E95B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Identity',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '38EB0B5A-78BD-4318-AC30-6243D7754D7B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."DriverClass"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Behavior',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B57C3774-E6B4-4FE3-934F-2853228B7571' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."Priority"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Behavior',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5606AA9E-2D13-4421-BAE1-76517DD83AA2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."SupportsPreview"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Behavior',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7196FC12-55E7-4D8E-8B14-75FBBDE2A38E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."MaxResultsOverride"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Behavior',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A1393F82-28EC-4B51-8948-CFBE4A01DAA6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."ProviderConfig"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration & Security',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Provider Configuration',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '975CD5AE-A9FA-4888-80F4-1506C585B7BB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."CredentialID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration & Security',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Credential',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '431E42E5-21E4-4F24-A486-46982D2AB695' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."Credential"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration & Security',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Credential Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D41E3892-8D33-4998-81D2-632CAA6F22CF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers."Comments"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration & Security',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CC1B35C6-7B04-47F3-B564-85FB92E46C2B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E64DAB70-3FD4-4312-821E-A2D6E56C7870' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Providers.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '854D8A7C-B071-4AB7-A9C2-C10EFBCFBA57' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-search */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-search', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('a2fdfa6b-e010-428c-b3c8-66b0bc96fa58', 'C6923FA5-3F3D-4756-A2D8-E57125AF450F', 'FieldCategoryInfo', '{"Provider Identity":{"icon":"fa fa-id-card","description":"Core identification and UI display properties for the search provider"},"Search Behavior":{"icon":"fa fa-cogs","description":"Technical settings governing how and when the search provider executes"},"Configuration & Security":{"icon":"fa fa-key","description":"Provider-specific JSON settings, credentials, and administrative notes"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit fields and unique identifiers"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('ecac7693-7718-4bc4-97df-50050d446c20', 'C6923FA5-3F3D-4756-A2D8-E57125AF450F', 'FieldCategoryIcons', '{"Provider Identity":"fa fa-id-card","Search Behavior":"fa fa-cogs","Configuration & Security":"fa fa-key","System Metadata":"fa fa-database"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F';
/* Set categories for 10 fields */
-- UPDATE Entity Field Category Info MJ: File Storage Accounts."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6711D6D0-0FB5-4E95-94DE-936A1C3A22C2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Accounts."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DFD9E389-750A-49F3-81C9-BCE972359D67' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Accounts."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7AF85902-718B-435E-8575-1A77B0533EB1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Accounts."Provider"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Provider Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CFBED107-E7F8-47D2-A4FC-6B6FDA5A0869' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Accounts."IncludeInGlobalSearch"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Overview',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E2F5B8CC-D154-4554-BCA5-5487E00A7653' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Accounts."ProviderID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FB4CA74A-55EB-49B5-8EF9-4B1D3FBB02E7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Accounts."CredentialID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2704A192-0578-41E4-B9F1-013431B49B9B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Accounts."Credential"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9315B467-17C6-4FA2-AB5F-70774E51DDCF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Accounts.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '940C9A4B-99C1-43F7-B52D-BB7BA6BD684D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: File Storage Accounts.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7B02A9C8-027D-4EBD-995C-C5CE157976B5' AND "AutoUpdateCategory" = TRUE;
/* Refresh custom base views for modified entities so schema changes are picked up */

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', NOW(), 'TypeScript','Approved', '([Type]=''User'' AND [UserID] IS NOT NULL AND [RoleID] IS NULL OR [Type]=''Role'' AND [RoleID] IS NOT NULL AND [UserID] IS NULL OR [Type]=''Everyone'' AND [UserID] IS NULL AND [RoleID] IS NULL)', 'public ValidateTypeIdentifierAssignment(result: ValidationResult) {
	// Validates that the correct ID is provided or omitted based on the Type field
	const isUserValid = this."Type" === "User" && this."UserID" != null && this."RoleID" == null;
	const isRoleValid = this."Type" === "Role" && this."RoleID" != null && this."UserID" == null;
	const isEveryoneValid = this."Type" === "Everyone" && this."UserID" == null && this."RoleID" == null;

	if (!isUserValid && !isRoleValid && !isEveryoneValid) {
		result."Errors".push(new ValidationErrorInfo(
			"Type",
			"The identifier assignment is invalid for the selected Type. ''User'' requires a User ID and no Role ID, ''Role'' requires a Role ID and no User ID, and ''Everyone'' requires both to be empty.",
			this."Type",
			ValidationErrorType."Failure"
		));
	}
}', 'Permissions must be correctly assigned based on the type: a ''User'' type requires a User ID and no Role ID, a ''Role'' type requires a Role ID and no User ID, and the ''Everyone'' type requires both IDs to be empty. This ensures that permissions are always linked to the correct entity.', 'ValidateTypeIdentifierAssignment', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '14B62084-D683-487E-A939-D63AF61AD31F');

            

/* Generated Validation Functions for MJ: Search Providers */
-- CHECK constraint for MJ: Search Providers: Field: Priority was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', NOW(), 'TypeScript','Approved', '([Priority]>= 0)', 'public ValidatePriorityAtLeastZero(result: ValidationResult) {
	if (this."Priority" < 0) {
		result."Errors".push(new ValidationErrorInfo(
			"Priority",
			"Priority must be 0 or greater.",
			this."Priority",
			ValidationErrorType."Failure"
		));
	}
}', 'The priority level must be a non-negative value (0 or greater) to ensure valid ordering and categorization of records.', 'ValidatePriorityAtLeastZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '5606AA9E-2D13-4421-BAE1-76517DD83AA2');


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

-- Update the CHECK constraint to include new Geo* ExtendedType values
ALTER TABLE __mj."EntityField" DROP CONSTRAINT "CK_EntityField_ExtendedType";
ALTER TABLE __mj."EntityField"
 ADD CONSTRAINT "CK_EntityField_ExtendedType" CHECK (
    "ExtendedType" IN ('Code', 'Email', 'FaceTime', 'Geo', 'GeoLatitude', 'GeoLongitude', 'GeoCountry', 'GeoStateProvince', 'GeoCity', 'GeoPostalCode', 'GeoAddress', 'MSTeams', 'Other', 'SIP', 'SMS', 'Skype', 'Tel', 'URL', 'WhatsApp', 'ZoomMtg')
) NOT VALID;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwApplicationEntities" TO "cdp_Developer", "cdp_Integration", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spCreateApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Application Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spUpdateApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spDeleteApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Application Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntities" TO "cdp_Developer", "cdp_Integration", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for EntityFieldValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityFieldID in table EntityFieldValue;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityFieldValues" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: spCreateEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityFields" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: spDeleteEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for FileStorageAccountPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FileStorageAccountID in table FileStorageAccountPermission;

DO $$ BEGIN GRANT SELECT ON __mj."vwFileStorageAccounts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: File Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Accounts
-- Item: Permissions for vwFileStorageAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwFileStorageAccounts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: File Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Accounts
-- Item: spCreateFileStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FileStorageAccount
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateFileStorageAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: File Storage Accounts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateFileStorageAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: File Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Accounts
-- Item: spUpdateFileStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FileStorageAccount
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateFileStorageAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateFileStorageAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: File Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Accounts
-- Item: spDeleteFileStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileStorageAccount
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileStorageAccount" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: File Storage Accounts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileStorageAccount" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID A73293C1-FB0D-4900-A60B-74F947D02B59 */

DO $$ BEGIN GRANT SELECT ON __mj."vwFileStorageAccountPermissions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: File Storage Account Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: Permissions for vwFileStorageAccountPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwFileStorageAccountPermissions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: File Storage Account Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: spCreateFileStorageAccountPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FileStorageAccountPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateFileStorageAccountPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: File Storage Account Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateFileStorageAccountPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: File Storage Account Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: spUpdateFileStorageAccountPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FileStorageAccountPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateFileStorageAccountPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateFileStorageAccountPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: File Storage Account Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: spDeleteFileStorageAccountPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileStorageAccountPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileStorageAccountPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: File Storage Account Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileStorageAccountPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for InstanceConfiguration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Instance Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: vwInstanceConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Instance Configurations
-----               SCHEMA:      __mj
-----               BASE TABLE:  InstanceConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwInstanceConfigurations" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Instance Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: Permissions for vwInstanceConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwInstanceConfigurations" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Instance Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: spCreateInstanceConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR InstanceConfiguration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateInstanceConfiguration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Instance Configurations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateInstanceConfiguration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Instance Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: spUpdateInstanceConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR InstanceConfiguration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateInstanceConfiguration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateInstanceConfiguration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Instance Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: spDeleteInstanceConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR InstanceConfiguration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteInstanceConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Instance Configurations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteInstanceConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for SearchProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialID in table SearchProvider;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchProviders" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: Permissions for vwSearchProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchProviders" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: spCreateSearchProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Search Providers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: spUpdateSearchProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: spDeleteSearchProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchProvider" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Search Providers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchProvider" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."EntityField"."UserSearchPredicateAPI" IS 'Search predicate controlling how user search queries match against this field. Valid values: BeginsWith, Contains, EndsWith, Exact.';

COMMENT ON COLUMN __mj."EntityField"."AutoUpdateUserSearchPredicate" IS 'When true, CodeGen LLM can auto-set the UserSearchPredicateAPI value during code generation runs.';

COMMENT ON COLUMN __mj."EntityField"."AutoUpdateFullTextSearch" IS 'When true, CodeGen LLM can auto-set the FullTextSearchEnabled value during code generation runs.';

COMMENT ON COLUMN __mj."EntityField"."AutoUpdateExtendedType" IS 'When true (default), CodeGen can automatically suggest and apply ExtendedType values (GeoLatitude, GeoLongitude, GeoAddress, etc.) during LLM field categorization. Set to 0 to lock admin-specified ExtendedType.';

COMMENT ON COLUMN __mj."Entity"."SupportsGeoCoding" IS 'When true, CodeGen generates geo-aware subclass code, adds __mj_Latitude/__mj_Longitude virtual fields to the base view, and the UI shows a map view toggle. Auto-set by CodeGen when LLM detects geo-capable fields (address, lat/lng, etc.).';

COMMENT ON COLUMN __mj."Entity"."AutoUpdateSupportsGeoCoding" IS 'When true (default), CodeGen can automatically set SupportsGeoCoding based on LLM analysis of entity fields. Set to 0 to lock the value and prevent CodeGen from changing it.';

COMMENT ON COLUMN __mj."Entity"."AutoUpdateFullTextSearch" IS 'When true, CodeGen LLM can auto-configure full-text search settings (FullTextSearchEnabled, catalog, index, function) during code generation runs.';

COMMENT ON COLUMN __mj."Entity"."AutoUpdateAllowUserSearchAPI" IS 'When true, CodeGen LLM can auto-set AllowUserSearchAPI during code generation runs.';

COMMENT ON COLUMN __mj."Entity"."TrustServerCacheCompletely" IS 'When true (default), the server-side RunView cache will store and return cached results for this entity, trusting that all mutations flow through BaseEntity."Save"() which fires cache invalidation events. Set to false for entities whose rows are created as side-effects of other operations via raw SQL (e.g., Record Changes created by spCreateRecordChange_Internal), since those inserts bypass BaseEntity and never trigger cache invalidation.';

COMMENT ON COLUMN __mj."FileStorageAccount"."IncludeInGlobalSearch" IS 'When true, this storage account is included in universal/global search results. Only effective if the associated provider supports search (SupportsSearch = 1).';

COMMENT ON TABLE __mj."FileStorageAccountPermission" IS 'Controls which users and roles can access specific file storage accounts. If no permission records exist for an account, it is accessible to everyone (backwards compatible).';

COMMENT ON COLUMN __mj."FileStorageAccountPermission"."FileStorageAccountID" IS 'The storage account this permission applies to.';

COMMENT ON COLUMN __mj."FileStorageAccountPermission"."Type" IS 'Permission type: User (requires UserID), Role (requires RoleID), or Everyone (both NULL).';

COMMENT ON COLUMN __mj."FileStorageAccountPermission"."UserID" IS 'Required when Type is User. The specific user granted access to this storage account.';

COMMENT ON COLUMN __mj."FileStorageAccountPermission"."RoleID" IS 'Required when Type is Role. The role granted access to this storage account.';

COMMENT ON COLUMN __mj."FileStorageAccountPermission"."CanRead" IS 'Whether the grantee can read/search files in this storage account.';

COMMENT ON COLUMN __mj."FileStorageAccountPermission"."CanWrite" IS 'Whether the grantee can upload/modify files in this storage account.';

COMMENT ON TABLE __mj."InstanceConfiguration" IS 'Instance-level feature toggles and configuration. Controls which features are enabled per MJ Explorer deployment.';

COMMENT ON COLUMN __mj."InstanceConfiguration"."FeatureKey" IS 'Unique dot-notation key identifying the feature, e.g. Shell."SearchBar"."Enabled".';

COMMENT ON COLUMN __mj."InstanceConfiguration"."Value" IS 'Current value for this feature setting.';

COMMENT ON COLUMN __mj."InstanceConfiguration"."ValueType" IS 'Data type of the value: boolean, string, number, or json.';

COMMENT ON COLUMN __mj."InstanceConfiguration"."Category" IS 'Grouping category for admin UI display.';

COMMENT ON COLUMN __mj."InstanceConfiguration"."DisplayName" IS 'Human-readable display name for the setting.';

COMMENT ON COLUMN __mj."InstanceConfiguration"."Description" IS 'Optional extended description or help text for the setting.';

COMMENT ON COLUMN __mj."InstanceConfiguration"."DefaultValue" IS 'Factory default value. Used when resetting to defaults.';

COMMENT ON COLUMN __mj."SearchProvider"."DisplayName" IS 'UI display name for this provider shown in filter facets and result grouping (e.g., "Database", "Semantic Search"). When NULL, falls back to the Name column.';

COMMENT ON COLUMN __mj."SearchProvider"."Icon" IS 'CSS icon class for UI display in filter facets and result badges (e.g., "fa-solid fa-database", "fa-solid fa-brain"). Supports any CSS-based icon library. When NULL, a default icon is used.';

COMMENT ON COLUMN __mj."SearchProvider"."Name" IS 'Display name for this search provider (e.g., "Vector Search", "Algolia")';

COMMENT ON COLUMN __mj."SearchProvider"."Description" IS 'Human-readable description of what this provider searches and how it works';

COMMENT ON COLUMN __mj."SearchProvider"."DriverClass" IS 'ClassFactory key used with @RegisterClass(ISearchProvider, DriverClass) to instantiate the provider at runtime';

COMMENT ON COLUMN __mj."SearchProvider"."Status" IS 'Provider lifecycle status: Pending (not yet activated), Active (in use), Terminated (disabled)';

COMMENT ON COLUMN __mj."SearchProvider"."Priority" IS 'Execution priority (lower = higher priority). Controls provider ordering and can influence RRF weighting. Must be >= 0.';

COMMENT ON COLUMN __mj."SearchProvider"."SupportsPreview" IS 'Whether this provider should run during fast preview/autocomplete searches. Expensive providers (external APIs) may set this to 0.';

COMMENT ON COLUMN __mj."SearchProvider"."MaxResultsOverride" IS 'Optional per-provider cap on the number of results to return. Useful for rate-limited or pay-per-query external APIs. When NULL, uses the SearchEngine default.';

COMMENT ON COLUMN __mj."SearchProvider"."ProviderConfig" IS 'Optional JSON configuration blob for provider-specific settings (e.g., API endpoints, index names, tuning parameters). Schema is provider-defined.';

COMMENT ON COLUMN __mj."SearchProvider"."CredentialID" IS 'Optional FK to the Credential entity for providers that require authentication (e.g., Algolia API key, external service credentials)';

COMMENT ON COLUMN __mj."SearchProvider"."Comments" IS 'Free-form notes about this provider configuration';


-- ===================== Other =====================

----------------------------------------------------------------------
-- 6. Extended properties: EntityField columns
----------------------------------------------------------------------

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Application Entities */

/* spUpdate Permissions for MJ: Entities */

/* spUpdate Permissions for MJ: Entity Field Values */


/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField

/* spUpdate Permissions for MJ: Entity Fields */

/* spUpdate Permissions for MJ: File Storage Accounts */

/* spUpdate Permissions for MJ: File Storage Account Permissions */

/* spUpdate Permissions for MJ: Instance Configurations */

/* spUpdate Permissions for MJ: Search Providers */
