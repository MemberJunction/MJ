
-- ===================== DDL: Tables, PKs, Indexes =====================

-- =====================================================================================================================
-- Migration: Unified Permissions Architecture — Phase 2 (consolidated)
-- Version: v5.30.x
-- =====================================================================================================================
-- This migration consolidates the Phase 2 unified-permissions schema changes into a single script.
-- Application-level cascade-delete semantics for Dashboard child rows are handled out-of-band by
-- setting `CascadeDeletes=true` on the `MJ: Dashboards` entity in metadata (see
-- `metadata/entities/.entity-cascade-deletes-dashboards.json`); CodeGen regenerates
-- `spDeleteDashboard` to transactionally delete child rows before the parent. We deliberately
-- do NOT use SQL `ON DELETE CASCADE` so the delete fires through `BaseEntity."Delete"()` and audit /
-- engine cache invalidation runs for every child row.
--
-- 1. PermissionDomain catalog table — registers each permission subsystem (provider) so the
-- unified `PermissionEngine` can load them at startup via ClassFactory.
--
-- 2. EntityPermission Allow/Deny — adds `Type` column with CHECK ('Allow','Deny'). Default
-- 'Allow' preserves existing behaviour; Deny rows override Allow rows on the same
-- (EntityID, RoleID, action) at evaluation time.
--
-- 3. ResourcePermission."SharedByUserID" — adds the column + FK to `User` so resource-permission
-- grants record their grantor (parity with DashboardPermission, CollectionPermission,
-- ArtifactPermission, AccessControlRule). Required for UI surfaces that show
-- "Shared by {user}" on records the current user didn't create.
--
-- 4. UI Role permissions fix — closes gaps that were preventing UI users from sharing
-- dashboards / sending chat messages. Grants Create/Update/Delete on the four sharing
-- entities and on AI Prompt Runs + Artifact Version entities. Adds three RLS filters that
-- narrow UI reads on AIAgentRun / AIAgentRunStep / AIPromptRun to runs the user owns
-- (Developer and Integration roles are unchanged — they continue to see all runs).
-- Server-side ownership gates in the extended entity classes still enforce that a UI
-- user can only Create permissions on resources they own.
--
-- Layout below:
-- §1 PermissionDomain catalog (CREATE TABLE)
-- §2 EntityPermission."Type" (ALTER TABLE)
-- §3 ResourcePermission."SharedByUserID" (ALTER TABLE + FK)
-- §4 UI role permission updates + RLS filters (DML)
-- §5 Extended properties for all new columns
-- =====================================================================================================================


-- =====================================================================================================================
-- §1 PermissionDomain catalog
-- =====================================================================================================================
CREATE TABLE __mj."PermissionDomain" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "ProviderClassName" VARCHAR(500) NOT NULL,
 "SupportedGranteeTypes" VARCHAR(200) NOT NULL,
 "SupportedActions" VARCHAR(500) NOT NULL,
 "SupportsDeny" BOOLEAN NOT NULL DEFAULT FALSE,
 "SupportsExpiration" BOOLEAN NOT NULL DEFAULT FALSE,
 "SupportsHierarchyInheritance" BOOLEAN NOT NULL DEFAULT FALSE,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "DisplayOrder" INTEGER NOT NULL DEFAULT 100,
 "Icon" VARCHAR(100) NULL,
 CONSTRAINT PK_PermissionDomain PRIMARY KEY ("ID"),
 CONSTRAINT UQ_PermissionDomain_Name UNIQUE ("Name")
);

-- =====================================================================================================================
-- §2  EntityPermission Allow/Deny
-- =====================================================================================================================
ALTER TABLE __mj."EntityPermission"
 ADD COLUMN "Type" VARCHAR(10) NOT NULL CONSTRAINT DF_EntityPermission_Type DEFAULT 'Allow'
    CONSTRAINT CK_EntityPermission_Type CHECK ("Type" IN ('Allow','Deny'));

-- =====================================================================================================================
-- §3  ResourcePermission."SharedByUserID"
-- =====================================================================================================================
ALTER TABLE __mj."ResourcePermission"
 ADD COLUMN "SharedByUserID" UUID NULL;

ALTER TABLE __mj."PermissionDomain"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."PermissionDomain" */
ALTER TABLE __mj."PermissionDomain"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityPermission_EntityID" ON __mj."EntityPermission" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityPermission_RoleID" ON __mj."EntityPermission" ("RoleID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityPermission_ReadRLSFilterID" ON __mj."EntityPermission" ("ReadRLSFilterID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityPermission_CreateRLSFilterID" ON __mj."EntityPermission" ("CreateRLSFilterID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityPermission_UpdateRLSFilterID" ON __mj."EntityPermission" ("UpdateRLSFilterID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityPermission_DeleteRLSFilterID" ON __mj."EntityPermission" ("DeleteRLSFilterID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ResourcePermission_ResourceTypeID" ON __mj."ResourcePermission" ("ResourceTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ResourcePermission_RoleID" ON __mj."ResourcePermission" ("RoleID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ResourcePermission_UserID" ON __mj."ResourcePermission" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ResourcePermission_SharedByUserID" ON __mj."ResourcePermission" ("SharedByUserID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwArchiveRunDetails';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArchiveRunDetails"
AS SELECT
    a.*,
    "MJArchiveRun_ArchiveRunID"."StartedAt" AS "ArchiveRun",
    "MJEntity_EntityID"."Name" AS "Entity"
FROM
    __mj."ArchiveRunDetail" AS a
INNER JOIN
    __mj."ArchiveRun" AS "MJArchiveRun_ArchiveRunID"
  ON
    a."ArchiveRunID" = "MJArchiveRun_ArchiveRunID"."ID"
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    a."EntityID" = "MJEntity_EntityID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwPermissionDomains';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwPermissionDomains"
AS SELECT
    p.*
FROM
    __mj."PermissionDomain" AS p$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwResourcePermissions';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwResourcePermissions"
AS SELECT
    r.*,
    "MJResourceType_ResourceTypeID"."Name" AS "ResourceType",
    "MJRole_RoleID"."Name" AS "Role",
    "MJUser_UserID"."Name" AS "User",
    "MJUser_SharedByUserID"."Name" AS "SharedByUser"
FROM
    __mj."ResourcePermission" AS r
INNER JOIN
    __mj."ResourceType" AS "MJResourceType_ResourceTypeID"
  ON
    r."ResourceTypeID" = "MJResourceType_ResourceTypeID"."ID"
LEFT OUTER JOIN
    __mj."Role" AS "MJRole_RoleID"
  ON
    r."RoleID" = "MJRole_RoleID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    r."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_SharedByUserID"
  ON
    r."SharedByUserID" = "MJUser_SharedByUserID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateArchiveRunDetail"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ArchiveRunID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID VARCHAR(750) DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_StoragePath VARCHAR(1000) DEFAULT NULL,
    IN p_BytesArchived BIGINT DEFAULT NULL,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_ArchivedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_VersionStamp TIMESTAMPTZ DEFAULT NULL,
    IN p_IsRecordChangeArchive BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwArchiveRunDetails" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ArchiveRunDetail"
            (
                "ID",
                "ArchiveRunID",
                "EntityID",
                "RecordID",
                "Status",
                "StoragePath",
                "BytesArchived",
                "ErrorMessage",
                "ArchivedAt",
                "VersionStamp",
                "IsRecordChangeArchive"
            )
        VALUES
            (
                p_ID,
                p_ArchiveRunID,
                p_EntityID,
                p_RecordID,
                p_Status,
                p_StoragePath,
                COALESCE(p_BytesArchived, 0),
                p_ErrorMessage,
                p_ArchivedAt,
                p_VersionStamp,
                COALESCE(p_IsRecordChangeArchive, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ArchiveRunDetail"
            (
                "ArchiveRunID",
                "EntityID",
                "RecordID",
                "Status",
                "StoragePath",
                "BytesArchived",
                "ErrorMessage",
                "ArchivedAt",
                "VersionStamp",
                "IsRecordChangeArchive"
            )
        VALUES
            (
                p_ArchiveRunID,
                p_EntityID,
                p_RecordID,
                p_Status,
                p_StoragePath,
                COALESCE(p_BytesArchived, 0),
                p_ErrorMessage,
                p_ArchivedAt,
                p_VersionStamp,
                COALESCE(p_IsRecordChangeArchive, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwArchiveRunDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArchiveRunDetail"(
    IN p_ID UUID,
    IN p_ArchiveRunID UUID,
    IN p_EntityID UUID,
    IN p_RecordID VARCHAR(750),
    IN p_Status VARCHAR(50),
    IN p_StoragePath VARCHAR(1000),
    IN p_BytesArchived BIGINT,
    IN p_ErrorMessage TEXT,
    IN p_ArchivedAt TIMESTAMPTZ,
    IN p_VersionStamp TIMESTAMPTZ,
    IN p_IsRecordChangeArchive BOOLEAN
)
RETURNS SETOF __mj."vwArchiveRunDetails" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ArchiveRunDetail"
    SET
        "ArchiveRunID" = p_ArchiveRunID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "Status" = p_Status,
        "StoragePath" = p_StoragePath,
        "BytesArchived" = p_BytesArchived,
        "ErrorMessage" = p_ErrorMessage,
        "ArchivedAt" = p_ArchivedAt,
        "VersionStamp" = p_VersionStamp,
        "IsRecordChangeArchive" = p_IsRecordChangeArchive
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwArchiveRunDetails" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwArchiveRunDetails" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArchiveRunDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArchiveRunDetail"
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

CREATE OR REPLACE FUNCTION __mj."spCreateEntityPermission"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RoleID UUID DEFAULT NULL,
    IN p_CanCreate BOOLEAN DEFAULT NULL,
    IN p_CanRead BOOLEAN DEFAULT NULL,
    IN p_CanUpdate BOOLEAN DEFAULT NULL,
    IN p_CanDelete BOOLEAN DEFAULT NULL,
    IN p_ReadRLSFilterID UUID DEFAULT NULL,
    IN p_CreateRLSFilterID UUID DEFAULT NULL,
    IN p_UpdateRLSFilterID UUID DEFAULT NULL,
    IN p_DeleteRLSFilterID UUID DEFAULT NULL,
    IN p_Type VARCHAR(10) DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityPermissions" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityPermission"
            (
                "ID",
                "EntityID",
                "RoleID",
                "CanCreate",
                "CanRead",
                "CanUpdate",
                "CanDelete",
                "ReadRLSFilterID",
                "CreateRLSFilterID",
                "UpdateRLSFilterID",
                "DeleteRLSFilterID",
                "Type"
            )
        VALUES
            (
                p_ID,
                p_EntityID,
                p_RoleID,
                COALESCE(p_CanCreate, FALSE),
                COALESCE(p_CanRead, FALSE),
                COALESCE(p_CanUpdate, FALSE),
                COALESCE(p_CanDelete, FALSE),
                p_ReadRLSFilterID,
                p_CreateRLSFilterID,
                p_UpdateRLSFilterID,
                p_DeleteRLSFilterID,
                COALESCE(p_Type, 'Allow')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityPermission"
            (
                "EntityID",
                "RoleID",
                "CanCreate",
                "CanRead",
                "CanUpdate",
                "CanDelete",
                "ReadRLSFilterID",
                "CreateRLSFilterID",
                "UpdateRLSFilterID",
                "DeleteRLSFilterID",
                "Type"
            )
        VALUES
            (
                p_EntityID,
                p_RoleID,
                COALESCE(p_CanCreate, FALSE),
                COALESCE(p_CanRead, FALSE),
                COALESCE(p_CanUpdate, FALSE),
                COALESCE(p_CanDelete, FALSE),
                p_ReadRLSFilterID,
                p_CreateRLSFilterID,
                p_UpdateRLSFilterID,
                p_DeleteRLSFilterID,
                COALESCE(p_Type, 'Allow')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityPermission"(
    IN p_ID UUID,
    IN p_EntityID UUID,
    IN p_RoleID UUID,
    IN p_CanCreate BOOLEAN,
    IN p_CanRead BOOLEAN,
    IN p_CanUpdate BOOLEAN,
    IN p_CanDelete BOOLEAN,
    IN p_ReadRLSFilterID UUID,
    IN p_CreateRLSFilterID UUID,
    IN p_UpdateRLSFilterID UUID,
    IN p_DeleteRLSFilterID UUID,
    IN p_Type VARCHAR(10)
)
RETURNS SETOF __mj."vwEntityPermissions" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityPermission"
    SET
        "EntityID" = p_EntityID,
        "RoleID" = p_RoleID,
        "CanCreate" = p_CanCreate,
        "CanRead" = p_CanRead,
        "CanUpdate" = p_CanUpdate,
        "CanDelete" = p_CanDelete,
        "ReadRLSFilterID" = p_ReadRLSFilterID,
        "CreateRLSFilterID" = p_CreateRLSFilterID,
        "UpdateRLSFilterID" = p_UpdateRLSFilterID,
        "DeleteRLSFilterID" = p_DeleteRLSFilterID,
        "Type" = p_Type
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityPermissions" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityPermissions" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityPermission"
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

CREATE OR REPLACE FUNCTION __mj."spCreatePermissionDomain"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_ProviderClassName VARCHAR(500) DEFAULT NULL,
    IN p_SupportedGranteeTypes VARCHAR(200) DEFAULT NULL,
    IN p_SupportedActions VARCHAR(500) DEFAULT NULL,
    IN p_SupportsDeny BOOLEAN DEFAULT NULL,
    IN p_SupportsExpiration BOOLEAN DEFAULT NULL,
    IN p_SupportsHierarchyInheritance BOOLEAN DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_DisplayOrder INTEGER DEFAULT NULL,
    IN p_Icon VARCHAR(100) DEFAULT NULL
)
RETURNS SETOF __mj."vwPermissionDomains" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."PermissionDomain"
            (
                "ID",
                "Name",
                "Description",
                "ProviderClassName",
                "SupportedGranteeTypes",
                "SupportedActions",
                "SupportsDeny",
                "SupportsExpiration",
                "SupportsHierarchyInheritance",
                "IsActive",
                "DisplayOrder",
                "Icon"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_ProviderClassName,
                p_SupportedGranteeTypes,
                p_SupportedActions,
                COALESCE(p_SupportsDeny, FALSE),
                COALESCE(p_SupportsExpiration, FALSE),
                COALESCE(p_SupportsHierarchyInheritance, FALSE),
                COALESCE(p_IsActive, TRUE),
                COALESCE(p_DisplayOrder, 100),
                p_Icon
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."PermissionDomain"
            (
                "Name",
                "Description",
                "ProviderClassName",
                "SupportedGranteeTypes",
                "SupportedActions",
                "SupportsDeny",
                "SupportsExpiration",
                "SupportsHierarchyInheritance",
                "IsActive",
                "DisplayOrder",
                "Icon"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_ProviderClassName,
                p_SupportedGranteeTypes,
                p_SupportedActions,
                COALESCE(p_SupportsDeny, FALSE),
                COALESCE(p_SupportsExpiration, FALSE),
                COALESCE(p_SupportsHierarchyInheritance, FALSE),
                COALESCE(p_IsActive, TRUE),
                COALESCE(p_DisplayOrder, 100),
                p_Icon
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwPermissionDomains" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdatePermissionDomain"(
    IN p_ID UUID,
    IN p_Name VARCHAR(200),
    IN p_Description TEXT,
    IN p_ProviderClassName VARCHAR(500),
    IN p_SupportedGranteeTypes VARCHAR(200),
    IN p_SupportedActions VARCHAR(500),
    IN p_SupportsDeny BOOLEAN,
    IN p_SupportsExpiration BOOLEAN,
    IN p_SupportsHierarchyInheritance BOOLEAN,
    IN p_IsActive BOOLEAN,
    IN p_DisplayOrder INTEGER,
    IN p_Icon VARCHAR(100)
)
RETURNS SETOF __mj."vwPermissionDomains" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."PermissionDomain"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ProviderClassName" = p_ProviderClassName,
        "SupportedGranteeTypes" = p_SupportedGranteeTypes,
        "SupportedActions" = p_SupportedActions,
        "SupportsDeny" = p_SupportsDeny,
        "SupportsExpiration" = p_SupportsExpiration,
        "SupportsHierarchyInheritance" = p_SupportsHierarchyInheritance,
        "IsActive" = p_IsActive,
        "DisplayOrder" = p_DisplayOrder,
        "Icon" = p_Icon
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwPermissionDomains" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwPermissionDomains" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeletePermissionDomain"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."PermissionDomain"
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

CREATE OR REPLACE FUNCTION __mj."spCreateResourcePermission"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ResourceTypeID UUID DEFAULT NULL,
    IN p_ResourceRecordID VARCHAR(255) DEFAULT NULL,
    IN p_Type VARCHAR(10) DEFAULT NULL,
    IN p_StartSharingAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndSharingAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RoleID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_PermissionLevel VARCHAR(20) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SharedByUserID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwResourcePermissions" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ResourcePermission"
            (
                "ID",
                "ResourceTypeID",
                "ResourceRecordID",
                "Type",
                "StartSharingAt",
                "EndSharingAt",
                "RoleID",
                "UserID",
                "PermissionLevel",
                "Status",
                "SharedByUserID"
            )
        VALUES
            (
                p_ID,
                p_ResourceTypeID,
                p_ResourceRecordID,
                p_Type,
                p_StartSharingAt,
                p_EndSharingAt,
                p_RoleID,
                p_UserID,
                p_PermissionLevel,
                COALESCE(p_Status, 'Requested'),
                p_SharedByUserID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ResourcePermission"
            (
                "ResourceTypeID",
                "ResourceRecordID",
                "Type",
                "StartSharingAt",
                "EndSharingAt",
                "RoleID",
                "UserID",
                "PermissionLevel",
                "Status",
                "SharedByUserID"
            )
        VALUES
            (
                p_ResourceTypeID,
                p_ResourceRecordID,
                p_Type,
                p_StartSharingAt,
                p_EndSharingAt,
                p_RoleID,
                p_UserID,
                p_PermissionLevel,
                COALESCE(p_Status, 'Requested'),
                p_SharedByUserID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwResourcePermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateResourcePermission"(
    IN p_ID UUID,
    IN p_ResourceTypeID UUID,
    IN p_ResourceRecordID VARCHAR(255),
    IN p_Type VARCHAR(10),
    IN p_StartSharingAt TIMESTAMPTZ,
    IN p_EndSharingAt TIMESTAMPTZ,
    IN p_RoleID UUID,
    IN p_UserID UUID,
    IN p_PermissionLevel VARCHAR(20),
    IN p_Status VARCHAR(20),
    IN p_SharedByUserID UUID
)
RETURNS SETOF __mj."vwResourcePermissions" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ResourcePermission"
    SET
        "ResourceTypeID" = p_ResourceTypeID,
        "ResourceRecordID" = p_ResourceRecordID,
        "Type" = p_Type,
        "StartSharingAt" = p_StartSharingAt,
        "EndSharingAt" = p_EndSharingAt,
        "RoleID" = p_RoleID,
        "UserID" = p_UserID,
        "PermissionLevel" = p_PermissionLevel,
        "Status" = p_Status,
        "SharedByUserID" = p_SharedByUserID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwResourcePermissions" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwResourcePermissions" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteResourcePermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ResourcePermission"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateArchiveRunDetail_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateArchiveRunDetail" ON __mj."ArchiveRunDetail";
CREATE TRIGGER "trgUpdateArchiveRunDetail"
    BEFORE UPDATE ON __mj."ArchiveRunDetail"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateArchiveRunDetail_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityPermission_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityPermission" ON __mj."EntityPermission";
CREATE TRIGGER "trgUpdateEntityPermission"
    BEFORE UPDATE ON __mj."EntityPermission"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityPermission_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdatePermissionDomain_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdatePermissionDomain" ON __mj."PermissionDomain";
CREATE TRIGGER "trgUpdatePermissionDomain"
    BEFORE UPDATE ON __mj."PermissionDomain"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdatePermissionDomain_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateResourcePermission_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateResourcePermission" ON __mj."ResourcePermission";
CREATE TRIGGER "trgUpdateResourcePermission"
    BEFORE UPDATE ON __mj."ResourcePermission"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateResourcePermission_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================
--
-- Hand-translated §4 block: SQL Server source uses MERGE INTO + DECLARE
-- variable initializers, neither of which the converter handles. PG
-- equivalent uses INSERT … ON CONFLICT for the upsert and inline UUID
-- literals for the filter IDs.

DO $$
DECLARE
  v_UIRoleID UUID;
  v_FilterAgentRunsID  UUID := 'E1AF0001-0000-4000-B000-000000000001';
  v_FilterAgentStepsID UUID := 'E1AF0002-0000-4000-B000-000000000002';
  v_FilterPromptRunsID UUID := 'E1AF0003-0000-4000-B000-000000000003';
BEGIN
  SELECT "ID" INTO v_UIRoleID FROM __mj."Role" WHERE "SQLName" = 'cdp_UI';
  IF v_UIRoleID IS NULL THEN
    RAISE EXCEPTION 'UI role (cdp_UI) not found - cannot apply permission migration.';
  END IF;

  -- ----- 5a) Sharing entities — full CRUD; ownership is gated server-side in extended classes.
  UPDATE __mj."EntityPermission"
    SET "CanCreate" = TRUE, "CanUpdate" = TRUE, "CanDelete" = TRUE
    WHERE "EntityID" = '771ed81a-b504-4027-b223-ca3abbaa3c75' AND "RoleID" = v_UIRoleID;  -- Dashboard Permissions
  UPDATE __mj."EntityPermission"
    SET "CanCreate" = TRUE, "CanUpdate" = TRUE, "CanDelete" = TRUE
    WHERE "EntityID" = '201852e1-4587-ef11-8473-6045bdf077ee' AND "RoleID" = v_UIRoleID;  -- Resource Permissions
  UPDATE __mj."EntityPermission" SET "CanDelete" = TRUE
    WHERE "EntityID" = '19846e1a-fd8e-405f-a0fa-42a7aa44758d' AND "RoleID" = v_UIRoleID;  -- Artifact Permissions
  UPDATE __mj."EntityPermission" SET "CanDelete" = TRUE
    WHERE "EntityID" = '55e5a944-6ecd-491d-a4e9-99e1453febdb' AND "RoleID" = v_UIRoleID;  -- Collection Permissions

  -- ----- 5b) AI Prompt Runs + artifact-version writes
  UPDATE __mj."EntityPermission" SET "CanCreate" = TRUE, "CanUpdate" = TRUE
    WHERE "EntityID" = '7c1c98d0-3978-4ce8-8e3f-c90301e59767' AND "RoleID" = v_UIRoleID;  -- AI Prompt Runs
  UPDATE __mj."EntityPermission" SET "CanCreate" = TRUE, "CanUpdate" = TRUE
    WHERE "EntityID" = 'aeb408d2-162a-49ae-9dc2-dbe9a21a3c01' AND "RoleID" = v_UIRoleID;  -- Artifact Versions
  UPDATE __mj."EntityPermission" SET "CanCreate" = TRUE, "CanUpdate" = TRUE
    WHERE "EntityID" = '5d4bc8d7-ab3f-444e-b85a-fc89297887b2' AND "RoleID" = v_UIRoleID;  -- Artifact Version Attributes

  -- ----- 5c) RLS filters — upsert (PG equivalent of T-SQL MERGE).
  INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "Description", "FilterText") VALUES
    (v_FilterAgentRunsID,  'UI: Own AI Agent Runs',
      'Narrows MJ: AI Agent Runs reads to runs owned by the current user. Applied to the UI role''s EntityPermission.ReadRLSFilterID.',
      'UserID = ''{{UserID}}'''),
    (v_FilterAgentStepsID, 'UI: Own AI Agent Run Steps',
      'Narrows MJ: AI Agent Run Steps reads to steps of agent runs owned by the current user.',
      'AgentRunID IN (SELECT ID FROM AIAgentRun WHERE UserID = ''{{UserID}}'')'),
    (v_FilterPromptRunsID, 'UI: Own AI Prompt Runs',
      'Narrows MJ: AI Prompt Runs reads to prompt runs whose parent agent run is owned by the current user. Standalone prompt runs (AgentRunID IS NULL) are not visible to UI users — they''re typically admin/system triggered.',
      'AgentRunID IN (SELECT ID FROM AIAgentRun WHERE UserID = ''{{UserID}}'')')
  ON CONFLICT ("ID") DO UPDATE
    SET "Name"        = EXCLUDED."Name",
        "Description" = EXCLUDED."Description",
        "FilterText"  = EXCLUDED."FilterText";

  -- Apply each filter to the UI role's EntityPermission.ReadRLSFilterID.
  UPDATE __mj."EntityPermission" SET "ReadRLSFilterID" = v_FilterAgentRunsID
    WHERE "EntityID" = '5190af93-4c39-4429-bdaa-0aeb492a0256' AND "RoleID" = v_UIRoleID;  -- MJ: AI Agent Runs
  UPDATE __mj."EntityPermission" SET "ReadRLSFilterID" = v_FilterAgentStepsID
    WHERE "EntityID" = '99273dad-560e-4abc-8332-c97ab58b7463' AND "RoleID" = v_UIRoleID;  -- MJ: AI Agent Run Steps
  UPDATE __mj."EntityPermission" SET "ReadRLSFilterID" = v_FilterPromptRunsID
    WHERE "EntityID" = '7c1c98d0-3978-4ce8-8e3f-c90301e59767' AND "RoleID" = v_UIRoleID;  -- MJ: AI Prompt Runs
END $$;

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
         "AllowCaching"
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
         '34987c4c-cc16-4aa3-b5bd-687c47ed78b2',
         'MJ: Permission Domains',
         'Permission Domains',
         'Catalog of registered permission subsystems. Each row describes one permission provider; the PermissionEngine uses ProviderClassName as the ClassFactory key to instantiate providers at startup. Enables unified permission queries across all subsystems.',
         NULL,
         'PermissionDomain',
         'vwPermissionDomains',
         '__mj',
         TRUE,
         TRUE,
         TRUE
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
/* SQL generated to add new entity MJ: Permission Domains to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '34987c4c-cc16-4aa3-b5bd-687c47ed78b2', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Permission Domains for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('34987c4c-cc16-4aa3-b5bd-687c47ed78b2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Permission Domains for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('34987c4c-cc16-4aa3-b5bd-687c47ed78b2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Permission Domains for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('34987c4c-cc16-4aa3-b5bd-687c47ed78b2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."PermissionDomain" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."PermissionDomain" */
UPDATE __mj."PermissionDomain" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."PermissionDomain" */
ALTER TABLE __mj."PermissionDomain" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."PermissionDomain"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."PermissionDomain" */
UPDATE __mj."PermissionDomain" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."PermissionDomain" */
ALTER TABLE __mj."PermissionDomain" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."PermissionDomain"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '42b9846c-7a43-4763-9d03-ea12a75fe9f3' OR ("EntityID" = 'EA238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Type')
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
        '42b9846c-7a43-4763-9d03-ea12a75fe9f3',
        'EA238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Permissions"
        100035,
        'Type',
        'Type',
        'Allow or Deny. Deny rows override any Allow grants on the same (EntityID, RoleID, action) at evaluation time, letting administrators exclude a role from an action another role grants.',
        'TEXT',
        20,
        0,
        0,
        FALSE,
        'Allow',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ccb04617-55a8-4caa-964d-c1f38d400aac' OR ("EntityID" = '201852E1-4587-EF11-8473-6045BDF077EE' AND "Name" = 'SharedByUserID')
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
        'ccb04617-55a8-4caa-964d-c1f38d400aac',
        '201852E1-4587-EF11-8473-6045BDF077EE', -- "Entity": "MJ": "Resource" "Permissions"
        100029,
        'SharedByUserID',
        'Shared By User ID',
        'The user who granted this permission. NULL when the share pre-dates this column or when the grantor is unknown (e.g., a system-seeded permission).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b3c3a5c3-41e4-4b6e-a233-79cc169b8d93' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'ID')
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
        'b3c3a5c3-41e4-4b6e-a233-79cc169b8d93',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a4089c3e-2a33-48f5-a833-570d0a3a6344' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'Name')
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
        'a4089c3e-2a33-48f5-a833-570d0a3a6344',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100002,
        'Name',
        'Name',
        'Human-readable unique name for the permission domain (e.g., "Entity Permissions", "Dashboard Permissions"). Used in admin UI and as the domain identifier in PermissionEngine API calls.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a8276d2c-552f-41f9-a262-ac32a92f652c' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'Description')
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
        'a8276d2c-552f-41f9-a262-ac32a92f652c',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100003,
        'Description',
        'Description',
        'Detailed description of what this permission domain covers and how permissions are enforced.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '83b92d39-cc5d-42bc-8732-1eb84c81ca93' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'ProviderClassName')
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
        '83b92d39-cc5d-42bc-8732-1eb84c81ca93',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100004,
        'ProviderClassName',
        'Provider Class Name',
        'ClassFactory key used to instantiate this provider. Must match the key passed to @RegisterClass(PermissionProviderBase, ''ClassName''). Convention: prefix with MJ for built-in providers (e.g., MJEntityPermissionProvider).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b18b58c5-bce3-4a59-8db7-b601b718a922' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'SupportedGranteeTypes')
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
        'b18b58c5-bce3-4a59-8db7-b601b718a922',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100005,
        'SupportedGranteeTypes',
        'Supported Grantee Types',
        'Comma-delimited list of grantee types this provider supports. Valid tokens: User, Role, Everyone, Public. Example: "User,Role".',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '271f5672-9e32-4f4c-bfde-a61dfd346801' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'SupportedActions')
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
        '271f5672-9e32-4f4c-bfde-a61dfd346801',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100006,
        'SupportedActions',
        'Supported Actions',
        'Comma-delimited list of permission actions this provider can evaluate. Valid tokens: Read, Create, Update, Delete, Share, Execute, Admin. Example: "Read,Create,Update,Delete".',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '13af21be-95f9-4dbf-b0e6-d6f3ea98f0fb' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'SupportsDeny')
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
        '13af21be-95f9-4dbf-b0e6-d6f3ea98f0fb',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100007,
        'SupportsDeny',
        'Supports Deny',
        'When true, this provider supports explicit Deny records that override Allow grants at the same scope.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bfac0067-e99c-4493-9d61-d871fd49d6b1' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'SupportsExpiration')
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
        'bfac0067-e99c-4493-9d61-d871fd49d6b1',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100008,
        'SupportsExpiration',
        'Supports Expiration',
        'When true, this provider supports time-bound permissions with an expiration timestamp.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '17dc3403-73ec-4baa-8774-bd2c4655accb' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'SupportsHierarchyInheritance')
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
        '17dc3403-73ec-4baa-8774-bd2c4655accb',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100009,
        'SupportsHierarchyInheritance',
        'Supports Hierarchy Inheritance',
        'When true, this provider resolves permissions hierarchically (e.g., category-level grants cascade to items within the category).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a7192e15-b12f-4680-a8a6-bbce14e21b8f' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'IsActive')
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
        'a7192e15-b12f-4680-a8a6-bbce14e21b8f',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100010,
        'IsActive',
        'Is Active',
        'When false, the PermissionEngine skips loading this provider at startup. Use to temporarily disable a provider without removing its record.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '31bdc7c8-1ad1-4f28-b4d6-c0559cc51e37' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'DisplayOrder')
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
        '31bdc7c8-1ad1-4f28-b4d6-c0559cc51e37',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100011,
        'DisplayOrder',
        'Display Order',
        'Sort order for displaying domains in the Sharing Center admin UI. Lower numbers appear first.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(100)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2872fcd7-ac3e-47af-94f3-85d3dc998760' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = 'Icon')
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
        '2872fcd7-ac3e-47af-94f3-85d3dc998760',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100012,
        'Icon',
        'Icon',
        'Optional Font Awesome icon class for display in admin UI (e.g., "fa-solid fa-shield").',
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3b07af73-44ca-4611-aa96-c8c47e025b3d' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = '__mj_CreatedAt')
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
        '3b07af73-44ca-4611-aa96-c8c47e025b3d',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100013,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4dfb201e-c019-42f5-8cb9-0ab80e08f2eb' OR ("EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND "Name" = '__mj_UpdatedAt')
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
        '4dfb201e-c019-42f5-8cb9-0ab80e08f2eb',
        '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- "Entity": "MJ": "Permission" "Domains"
        100014,
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
                                       ('b2175e01-0256-4652-9af4-87189ccb9425', '42B9846C-7A43-4763-9D03-EA12A75FE9F3', 1, 'Allow', 'Allow', NOW(), NOW());
/* SQL text to insert entity field value with ID ecb471a0-e219-4386-9bfe-950ed7c79aab */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ecb471a0-e219-4386-9bfe-950ed7c79aab', '42B9846C-7A43-4763-9D03-EA12A75FE9F3', 2, 'Deny', 'Deny', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 42B9846C-7A43-4763-9D03-EA12A75FE9F3 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='42B9846C-7A43-4763-9D03-EA12A75FE9F3';
/* Create Entity Relationship: MJ: Users -> MJ: Resource Permissions (One To Many via SharedByUserID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b9276fc4-135c-4e5a-8143-23d40ba300bf'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('b9276fc4-135c-4e5a-8143-23d40ba300bf', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '201852E1-4587-EF11-8473-6045BDF077EE', 'SharedByUserID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '03ada0e1-afd7-425c-a79b-7e032bb210b9' OR ("EntityID" = '201852E1-4587-EF11-8473-6045BDF077EE' AND "Name" = 'SharedByUser')
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
        '03ada0e1-afd7-425c-a79b-7e032bb210b9',
        '201852E1-4587-EF11-8473-6045BDF077EE', -- "Entity": "MJ": "Resource" "Permissions"
        100033,
        'SharedByUser',
        'Shared By User',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3a9425c5-bb17-4f0c-8e81-08dbdaca9fda' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'ArchiveRun')
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
        '3a9425c5-bb17-4f0c-8e81-08dbdaca9fda',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100029, -- auto-bumped from 100028 (UQ_EntityField_EntityID_Sequence dedup),
        'ArchiveRun',
        'Archive Run',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
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

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '83B92D39-CC5D-42BC-8732-1EB84C81CA93'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A7192E15-B12F-4680-A8A6-BBCE14E21B8F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '31BDC7C8-1AD1-4F28-B4D6-C0559CC51E37'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '83B92D39-CC5D-42BC-8732-1EB84C81CA93'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'A4089C3E-2A33-48F5-A833-570D0A3A6344'
               AND "AutoUpdateUserSearchPredicate" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'C65717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '42B9846C-7A43-4763-9D03-EA12A75FE9F3'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'C65717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '1029550C-6E47-EF11-86C3-00224821D189'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'C65717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '1029550C-6E47-EF11-86C3-00224821D189'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = 'EA238F34-2837-EF11-86D4-6045BDEE16E6'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '99EB5364-1B2B-430B-BC94-709C6D26AA08'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'EA65A64E-9935-4702-AEDD-A2A4BDC1BCD2'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'AAB9433E-F36B-1410-867F-007B559E242F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'E3344718-4687-EF11-8473-6045BDF077EE'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '3922FE34-E68A-EF11-8473-6045BDF077EE'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '99EB5364-1B2B-430B-BC94-709C6D26AA08'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'EA65A64E-9935-4702-AEDD-A2A4BDC1BCD2'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '1A164F09-D65D-4B1F-B954-F1A2201427F0'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '99EB5364-1B2B-430B-BC94-709C6D26AA08'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '1A164F09-D65D-4B1F-B954-F1A2201427F0'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'EA65A64E-9935-4702-AEDD-A2A4BDC1BCD2'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'E3344718-4687-EF11-8473-6045BDF077EE'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '3922FE34-E68A-EF11-8473-6045BDF077EE'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = '201852E1-4587-EF11-8473-6045BDF077EE'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;
/* Set categories for 15 fields */
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '79525349-F1A7-45CD-BDDB-15D45E1EA4D5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B90E24FD-D3A9-4D00-A94B-17E2B1FB2FE3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EB7FEB68-C246-4B48-9518-B8BCF5793611' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ArchiveRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0C1AE9BD-D895-4ECF-B65B-43EA80D9949C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."EntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6170C43C-462B-42B1-972B-1D8B7789682B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."RecordID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."Entity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0A500C87-F127-4776-8EEF-7ECA8E7A414C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B67B2260-8850-40F9-8902-5D91D0159FE7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."StoragePath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2A48A363-DC62-4DD2-833B-EB7CFBABB283' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."BytesArchived"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5B53CD8F-01E4-41C3-A6E3-313A83103ECF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ErrorMessage"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0823FBF5-191B-4799-A64E-778C6AF033A1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ArchivedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BFCCF263-AF8A-405C-B57D-473AAC8A9E90' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."VersionStamp"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '07F192B4-3A6D-4FEB-869B-6ED067BB82F0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."IsRecordChangeArchive"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Record Change',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4959B7F3-AD32-40DD-8E3F-8DF97E4C6844' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ArchiveRun"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Timeline and Versioning',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Archive Run Timestamp',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3A9425C5-BB17-4F0C-8E81-08DBDACA9FDA' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 14 fields */
-- UPDATE Entity Field Category Info MJ: Permission Domains."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B3C3A5C3-41E4-4B6E-A233-79CC169B8D93' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Domain Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A4089C3E-2A33-48F5-A833-570D0A3A6344' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Domain Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A8276D2C-552F-41F9-A262-AC32A92F652C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains."ProviderClassName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Implementation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '83B92D39-CC5D-42BC-8732-1EB84C81CA93' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains."SupportedGranteeTypes"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Capabilities',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B18B58C5-BCE3-4A59-8DB7-B601B718A922' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains."SupportedActions"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Capabilities',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '271F5672-9E32-4F4C-BFDE-A61DFD346801' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains."SupportsDeny"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Capabilities',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '13AF21BE-95F9-4DBF-B0E6-D6F3EA98F0FB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains."SupportsExpiration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Capabilities',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BFAC0067-E99C-4493-9D61-D871FD49D6B1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains."SupportsHierarchyInheritance"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Capabilities',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '17DC3403-73EC-4BAA-8774-BD2C4655ACCB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains."IsActive"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Domain Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A7192E15-B12F-4680-A8A6-BBCE14E21B8F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains."DisplayOrder"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Domain Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '31BDC7C8-1AD1-4F28-B4D6-C0559CC51E37' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains."Icon"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Domain Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2872FCD7-AC3E-47AF-94F3-85D3DC998760' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3B07AF73-44CA-4611-AA96-C8C47E025B3D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Permission Domains.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4DFB201E-C019-42F5-8CB9-0AB80E08F2EB' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-shield-alt */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-shield-alt', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('6d901918-fff0-4895-958d-879c2cffaef3', '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', 'FieldCategoryInfo', '{"Domain Configuration":{"icon":"fa fa-sliders-h","description":"General settings and UI configuration for the permission domain"},"Provider Implementation":{"icon":"fa fa-code","description":"Technical settings required for the PermissionEngine to instantiate providers"},"Provider Capabilities":{"icon":"fa fa-cogs","description":"Functional capabilities and feature flags supported by the provider"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('b496b7c7-2bcd-46d9-8fb0-c6715bd48eac', '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', 'FieldCategoryIcons', '{"Domain Configuration":"fa fa-sliders-h","Provider Implementation":"fa fa-code","Provider Capabilities":"fa fa-cogs","System Metadata":"fa fa-database"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2';
/* Set categories for 17 fields */
-- UPDATE Entity Field Category Info MJ: Resource Permissions."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9EB9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."ResourceTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resource Reference',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A1B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."ResourceRecordID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resource Reference',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Resource Record',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A4B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."ResourceType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '99EB5364-1B2B-430B-BC94-709C6D26AA08' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Share Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DE344718-4687-EF11-8473-6045BDF077EE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."PermissionLevel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E3344718-4687-EF11-8473-6045BDF077EE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."Role"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EA65A64E-9935-4702-AEDD-A2A4BDC1BCD2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."User"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1A164F09-D65D-4B1F-B954-F1A2201427F0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."RoleID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Recipient & Access Scope',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ADB9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."UserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Recipient & Access Scope',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B0B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."StartSharingAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sharing Schedule & Status',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Start Date',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A7B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."EndSharingAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sharing Schedule & Status',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'End Date',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AAB9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3922FE34-E68A-EF11-8473-6045BDF077EE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."SharedByUserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Audit Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CCB04617-55A8-4CAA-964D-C1F38D400AAC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions."SharedByUser"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Audit Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '03ADA0E1-AFD7-425C-A79B-7E032BB210B9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B3B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Resource Permissions.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B6B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('b3f14b46-b586-4e38-8b53-ad05fdfd7850', '201852E1-4587-EF11-8473-6045BDF077EE', 'FieldCategoryInfo', '{"Audit Information":{"icon":"fa fa-user-check","description":"Details regarding who performed the sharing action"}}', NOW(), NOW());
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Audit Information":"fa fa-user-check"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '201852E1-4587-EF11-8473-6045BDF077EE' AND "Name" = 'FieldCategoryIcons';
/* Set categories for 21 fields */
-- UPDATE Entity Field Category Info MJ: Entity Permissions."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Created At',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D45717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Updated At',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D55717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."EntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4C4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."RoleID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E0939AE7-A838-EF11-86D4-000D3A4E707E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."Entity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C65717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."RoleName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1029550C-6E47-EF11-86C3-00224821D189' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."RoleSQLName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Role SQL Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C75717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."Type"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Entity & Role Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Access Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '42B9846C-7A43-4763-9D03-EA12A75FE9F3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."CanCreate"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."CanRead"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4E4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."CanUpdate"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4F4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."CanDelete"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '504F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."ReadRLSFilterID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Read Filter ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E14217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."CreateRLSFilterID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Create Filter ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E24217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."UpdateRLSFilterID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Update Filter ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E34217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."DeleteRLSFilterID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Delete Filter ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E44217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."CreateRLSFilter"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Create Filter',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = 'C85717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."ReadRLSFilter"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Read Filter',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = 'C95717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."UpdateRLSFilter"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Update Filter',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = 'CA5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Permissions."DeleteRLSFilter"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Delete Filter',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = 'CB5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* Refresh custom base views for modified entities so schema changes are picked up */


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."ResourcePermission"
 ADD CONSTRAINT "FK_ResourcePermission_SharedByUserID"
    FOREIGN KEY ("SharedByUserID")
    REFERENCES __mj."User"("ID") DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwArchiveRunDetails" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: Permissions for vwArchiveRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArchiveRunDetails" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spCreateArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArchiveRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Archive Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArchiveRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spUpdateArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArchiveRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArchiveRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spDeleteArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Archive Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for EntityPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityPermission;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityPermissions" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Permissions
-- Item: spCreateEntityPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Permissions
-- Item: spUpdateEntityPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Permissions
-- Item: spDeleteEntityPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for PermissionDomain */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: vwPermissionDomains
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Permission Domains
-----               SCHEMA:      __mj
-----               BASE TABLE:  PermissionDomain
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwPermissionDomains" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: Permissions for vwPermissionDomains
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwPermissionDomains" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: spCreatePermissionDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PermissionDomain
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreatePermissionDomain" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Permission Domains */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreatePermissionDomain" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: spUpdatePermissionDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PermissionDomain
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdatePermissionDomain" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdatePermissionDomain" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: spDeletePermissionDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PermissionDomain
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeletePermissionDomain" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Permission Domains */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeletePermissionDomain" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for ResourcePermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ResourceTypeID in table ResourcePermission;

DO $$ BEGIN GRANT SELECT ON __mj."vwResourcePermissions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Resource Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: Permissions for vwResourcePermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwResourcePermissions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Resource Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: spCreateResourcePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ResourcePermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateResourcePermission" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Resource Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateResourcePermission" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Resource Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: spUpdateResourcePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ResourcePermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateResourcePermission" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateResourcePermission" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Resource Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: spDeleteResourcePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ResourcePermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteResourcePermission" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Resource Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteResourcePermission" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON TABLE __mj."PermissionDomain" IS 'Catalog of registered permission subsystems. Each row describes one permission provider; the PermissionEngine uses ProviderClassName as the ClassFactory key to instantiate providers at startup. Enables unified permission queries across all subsystems.';

COMMENT ON COLUMN __mj."PermissionDomain"."Name" IS 'Human-readable unique name for the permission domain (e.g., "Entity Permissions", "Dashboard Permissions"). Used in admin UI and as the domain identifier in PermissionEngine API calls.';

COMMENT ON COLUMN __mj."PermissionDomain"."Description" IS 'Detailed description of what this permission domain covers and how permissions are enforced.';

COMMENT ON COLUMN __mj."PermissionDomain"."ProviderClassName" IS 'ClassFactory key used to instantiate this provider. Must match the key passed to @RegisterClass(PermissionProviderBase, ';

COMMENT ON COLUMN __mj."PermissionDomain"."SupportedGranteeTypes" IS 'Comma-delimited list of grantee types this provider supports. Valid tokens: User, Role, Everyone, Public. Example: "User,Role".';

COMMENT ON COLUMN __mj."PermissionDomain"."SupportedActions" IS 'Comma-delimited list of permission actions this provider can evaluate. Valid tokens: Read, Create, Update, Delete, Share, Execute, Admin. Example: "Read,Create,Update,Delete".';

COMMENT ON COLUMN __mj."PermissionDomain"."SupportsDeny" IS 'When true, this provider supports explicit Deny records that override Allow grants at the same scope.';

COMMENT ON COLUMN __mj."PermissionDomain"."SupportsExpiration" IS 'When true, this provider supports time-bound permissions with an expiration timestamp.';

COMMENT ON COLUMN __mj."PermissionDomain"."SupportsHierarchyInheritance" IS 'When true, this provider resolves permissions hierarchically (e.g., category-level grants cascade to items within the category).';

COMMENT ON COLUMN __mj."PermissionDomain"."IsActive" IS 'When false, the PermissionEngine skips loading this provider at startup. Use to temporarily disable a provider without removing its record.';

COMMENT ON COLUMN __mj."PermissionDomain"."DisplayOrder" IS 'Sort order for displaying domains in the Sharing Center admin UI. Lower numbers appear first.';

COMMENT ON COLUMN __mj."PermissionDomain"."Icon" IS 'Optional Font Awesome icon class for display in admin UI (e.g., "fa-solid fa-shield").';

COMMENT ON COLUMN __mj."EntityPermission"."Type" IS 'Allow or Deny. Deny rows override any Allow grants on the same (EntityID, RoleID, action) at evaluation time, letting administrators exclude a role from an action another role grants.';

COMMENT ON COLUMN __mj."ResourcePermission"."SharedByUserID" IS 'The user who granted this permission. NULL when the share pre-dates this column or when the grantor is unknown (e.g., a system-seeded permission).';


-- ===================== Other =====================

-- =====================================================================================================================
-- §5  Extended properties (descriptions for CodeGen)
-- =====================================================================================================================

-- ----- 5a) PermissionDomain table + columns

/* SQL generated to create new entity MJ: Permission Domains */

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Archive Run Details */

/* spUpdate Permissions for MJ: Entity Permissions */

/* spUpdate Permissions for MJ: Permission Domains */

/* spUpdate Permissions for MJ: Resource Permissions */
