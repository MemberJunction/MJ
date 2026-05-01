-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE TABLE __mj."ArchiveConfiguration" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(255) NOT NULL,
 "Description" TEXT NULL,
 "StorageAccountID" UUID NULL,
 "RootPath" VARCHAR(500) NOT NULL,
 "ArchiveFormat" VARCHAR(20) NOT NULL DEFAULT 'JSON',
 "IsActive" BOOLEAN NOT NULL DEFAULT FALSE,
 "DefaultRetentionDays" INTEGER NOT NULL DEFAULT 365,
 "DefaultMode" VARCHAR(20) NOT NULL DEFAULT 'StripFields',
 "DefaultBatchSize" INTEGER NOT NULL DEFAULT 100,
 "ArchiveRelatedRecordChanges" BOOLEAN NOT NULL DEFAULT TRUE,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Idle',
 "CreatedByUserID" UUID NOT NULL,
 CONSTRAINT PK_ArchiveConfiguration PRIMARY KEY ("ID"),
 CONSTRAINT FK_ArchiveConfiguration_StorageAccount FOREIGN KEY ("StorageAccountID")
 REFERENCES __mj."FileStorageAccount"("ID"),
 CONSTRAINT FK_ArchiveConfiguration_CreatedByUser FOREIGN KEY ("CreatedByUserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT CK_ArchiveConfiguration_ArchiveFormat
 CHECK ("ArchiveFormat" IN ('JSON', 'Parquet', 'CSV')),
 CONSTRAINT CK_ArchiveConfiguration_DefaultMode
 CHECK ("DefaultMode" IN ('StripFields', 'HardDelete', 'ArchiveOnly')),
 CONSTRAINT CK_ArchiveConfiguration_Status
 CHECK ("Status" IN ('Idle', 'Running', 'Error', 'Disabled'))
);

CREATE TABLE __mj."ArchiveConfigurationEntity" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ArchiveConfigurationID" UUID NOT NULL,
 "EntityID" UUID NOT NULL,
 "Mode" VARCHAR(20) NULL,
 "RetentionDays" INTEGER NULL,
 "DateField" VARCHAR(100) NOT NULL DEFAULT '__mj_CreatedAt',
 "FilterExpression" TEXT NULL,
 "BatchSize" INTEGER NULL,
 "Priority" INTEGER NOT NULL DEFAULT 100,
 "FieldConfiguration" TEXT NOT NULL,
 "DriverClass" VARCHAR(500) NULL,
 "ArchiveRelatedRecordChanges" BOOLEAN NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT PK_ArchiveConfigurationEntity PRIMARY KEY ("ID"),
 CONSTRAINT FK_ArchiveConfigEntity_Config FOREIGN KEY ("ArchiveConfigurationID")
 REFERENCES __mj."ArchiveConfiguration"("ID"),
 CONSTRAINT FK_ArchiveConfigEntity_Entity FOREIGN KEY ("EntityID")
 REFERENCES __mj."Entity"("ID"),
 CONSTRAINT UQ_ArchiveConfigEntity_ConfigEntity UNIQUE ("ArchiveConfigurationID", "EntityID"),
 CONSTRAINT CK_ArchiveConfigEntity_Mode
 CHECK ("Mode" IS NULL OR "Mode" IN ('StripFields', 'HardDelete', 'ArchiveOnly'))
);

CREATE TABLE __mj."ArchiveRun" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ArchiveConfigurationID" UUID NOT NULL,
 "StartedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "CompletedAt" TIMESTAMPTZ NULL,
 "Status" VARCHAR(50) NOT NULL DEFAULT 'Running',
 "TotalRecords" INTEGER NOT NULL DEFAULT 0,
 "ArchivedRecords" INTEGER NOT NULL DEFAULT 0,
 "FailedRecords" INTEGER NOT NULL DEFAULT 0,
 "SkippedRecords" INTEGER NOT NULL DEFAULT 0,
 "TotalBytesArchived" BIGINT NOT NULL DEFAULT 0,
 "ErrorLog" TEXT NULL,
 "UserID" UUID NOT NULL,
 CONSTRAINT PK_ArchiveRun PRIMARY KEY ("ID"),
 CONSTRAINT FK_ArchiveRun_Config FOREIGN KEY ("ArchiveConfigurationID")
 REFERENCES __mj."ArchiveConfiguration"("ID"),
 CONSTRAINT FK_ArchiveRun_User FOREIGN KEY ("UserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT CK_ArchiveRun_Status
 CHECK ("Status" IN ('Running', 'Complete', 'Failed', 'Cancelled', 'PartialSuccess'))
);

CREATE TABLE __mj."ArchiveRunDetail" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ArchiveRunID" UUID NOT NULL,
 "EntityID" UUID NOT NULL,
 "RecordID" VARCHAR(750) NOT NULL,
 "Status" VARCHAR(50) NOT NULL,
 "StoragePath" VARCHAR(1000) NULL,
 "BytesArchived" BIGINT NOT NULL DEFAULT 0,
 "ErrorMessage" TEXT NULL,
 "ArchivedAt" TIMESTAMPTZ NULL,
 "VersionStamp" TIMESTAMPTZ NULL,
 "IsRecordChangeArchive" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT PK_ArchiveRunDetail PRIMARY KEY ("ID"),
 CONSTRAINT FK_ArchiveRunDetail_Run FOREIGN KEY ("ArchiveRunID")
 REFERENCES __mj."ArchiveRun"("ID"),
 CONSTRAINT FK_ArchiveRunDetail_Entity FOREIGN KEY ("EntityID")
 REFERENCES __mj."Entity"("ID"),
 CONSTRAINT CK_ArchiveRunDetail_Status
 CHECK ("Status" IN ('Success', 'Failed', 'Skipped'))
);

ALTER TABLE __mj."ArchiveConfigurationEntity"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveConfigurationEntity" */
ALTER TABLE __mj."ArchiveConfigurationEntity"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveRun" */
ALTER TABLE __mj."ArchiveRun"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveRun" */
ALTER TABLE __mj."ArchiveRun"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveConfiguration" */
ALTER TABLE __mj."ArchiveConfiguration"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveConfiguration" */
ALTER TABLE __mj."ArchiveConfiguration"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveRunDetail" */
ALTER TABLE __mj."ArchiveRunDetail"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveRunDetail" */
ALTER TABLE __mj."ArchiveRunDetail"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArchiveConfigurationEntity_ArchiveCon_e369e933" ON __mj."ArchiveConfigurationEntity" ("ArchiveConfigurationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArchiveConfigurationEntity_EntityID" ON __mj."ArchiveConfigurationEntity" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArchiveConfiguration_StorageAccountID" ON __mj."ArchiveConfiguration" ("StorageAccountID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArchiveConfiguration_CreatedByUserID" ON __mj."ArchiveConfiguration" ("CreatedByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArchiveRunDetail_ArchiveRunID" ON __mj."ArchiveRunDetail" ("ArchiveRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArchiveRunDetail_EntityID" ON __mj."ArchiveRunDetail" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArchiveRun_ArchiveConfigurationID" ON __mj."ArchiveRun" ("ArchiveConfigurationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArchiveRun_UserID" ON __mj."ArchiveRun" ("UserID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwArchiveRunDetails';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArchiveRunDetails"
AS SELECT
    a.*,
    "MJEntity_EntityID"."Name" AS "Entity"
FROM
    __mj."ArchiveRunDetail" AS a
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
  v_target_name CONSTANT TEXT := 'vwArchiveConfigurations';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArchiveConfigurations"
AS SELECT
    a.*,
    "MJFileStorageAccount_StorageAccountID"."Name" AS "StorageAccount",
    "MJUser_CreatedByUserID"."Name" AS "CreatedByUser"
FROM
    __mj."ArchiveConfiguration" AS a
LEFT OUTER JOIN
    __mj."FileStorageAccount" AS "MJFileStorageAccount_StorageAccountID"
  ON
    a."StorageAccountID" = "MJFileStorageAccount_StorageAccountID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_CreatedByUserID"
  ON
    a."CreatedByUserID" = "MJUser_CreatedByUserID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwArchiveConfigurationEntities';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArchiveConfigurationEntities"
AS SELECT
    a.*,
    "MJArchiveConfiguration_ArchiveConfigurationID"."Name" AS "ArchiveConfiguration",
    "MJEntity_EntityID"."Name" AS "Entity"
FROM
    __mj."ArchiveConfigurationEntity" AS a
INNER JOIN
    __mj."ArchiveConfiguration" AS "MJArchiveConfiguration_ArchiveConfigurationID"
  ON
    a."ArchiveConfigurationID" = "MJArchiveConfiguration_ArchiveConfigurationID"."ID"
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
  v_target_name CONSTANT TEXT := 'vwArchiveRuns';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArchiveRuns"
AS SELECT
    a.*,
    "MJArchiveConfiguration_ArchiveConfigurationID"."Name" AS "ArchiveConfiguration",
    "MJUser_UserID"."Name" AS "User"
FROM
    __mj."ArchiveRun" AS a
INNER JOIN
    __mj."ArchiveConfiguration" AS "MJArchiveConfiguration_ArchiveConfigurationID"
  ON
    a."ArchiveConfigurationID" = "MJArchiveConfiguration_ArchiveConfigurationID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    a."UserID" = "MJUser_UserID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateArchiveConfiguration"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_StorageAccountID UUID DEFAULT NULL,
    IN p_RootPath VARCHAR(500) DEFAULT NULL,
    IN p_ArchiveFormat VARCHAR(20) DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_DefaultRetentionDays INTEGER DEFAULT NULL,
    IN p_DefaultMode VARCHAR(20) DEFAULT NULL,
    IN p_DefaultBatchSize INTEGER DEFAULT NULL,
    IN p_ArchiveRelatedRecordChanges BOOLEAN DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_CreatedByUserID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwArchiveConfigurations" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ArchiveConfiguration"
            (
                "ID",
                "Name",
                "Description",
                "StorageAccountID",
                "RootPath",
                "ArchiveFormat",
                "IsActive",
                "DefaultRetentionDays",
                "DefaultMode",
                "DefaultBatchSize",
                "ArchiveRelatedRecordChanges",
                "Status",
                "CreatedByUserID"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_StorageAccountID,
                p_RootPath,
                COALESCE(p_ArchiveFormat, 'JSO'),
                COALESCE(p_IsActive, FALSE),
                COALESCE(p_DefaultRetentionDays, 365),
                COALESCE(p_DefaultMode, 'StripFields'),
                COALESCE(p_DefaultBatchSize, 100),
                COALESCE(p_ArchiveRelatedRecordChanges, TRUE),
                COALESCE(p_Status, 'Idle'),
                p_CreatedByUserID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ArchiveConfiguration"
            (
                "Name",
                "Description",
                "StorageAccountID",
                "RootPath",
                "ArchiveFormat",
                "IsActive",
                "DefaultRetentionDays",
                "DefaultMode",
                "DefaultBatchSize",
                "ArchiveRelatedRecordChanges",
                "Status",
                "CreatedByUserID"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_StorageAccountID,
                p_RootPath,
                COALESCE(p_ArchiveFormat, 'JSO'),
                COALESCE(p_IsActive, FALSE),
                COALESCE(p_DefaultRetentionDays, 365),
                COALESCE(p_DefaultMode, 'StripFields'),
                COALESCE(p_DefaultBatchSize, 100),
                COALESCE(p_ArchiveRelatedRecordChanges, TRUE),
                COALESCE(p_Status, 'Idle'),
                p_CreatedByUserID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwArchiveConfigurations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArchiveConfiguration"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255),
    IN p_Description TEXT,
    IN p_StorageAccountID UUID,
    IN p_RootPath VARCHAR(500),
    IN p_ArchiveFormat VARCHAR(20),
    IN p_IsActive BOOLEAN,
    IN p_DefaultRetentionDays INTEGER,
    IN p_DefaultMode VARCHAR(20),
    IN p_DefaultBatchSize INTEGER,
    IN p_ArchiveRelatedRecordChanges BOOLEAN,
    IN p_Status VARCHAR(20),
    IN p_CreatedByUserID UUID
)
RETURNS SETOF __mj."vwArchiveConfigurations" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ArchiveConfiguration"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "StorageAccountID" = p_StorageAccountID,
        "RootPath" = p_RootPath,
        "ArchiveFormat" = p_ArchiveFormat,
        "IsActive" = p_IsActive,
        "DefaultRetentionDays" = p_DefaultRetentionDays,
        "DefaultMode" = p_DefaultMode,
        "DefaultBatchSize" = p_DefaultBatchSize,
        "ArchiveRelatedRecordChanges" = p_ArchiveRelatedRecordChanges,
        "Status" = p_Status,
        "CreatedByUserID" = p_CreatedByUserID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwArchiveConfigurations" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwArchiveConfigurations" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArchiveConfiguration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArchiveConfiguration"
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

CREATE OR REPLACE FUNCTION __mj."spCreateArchiveConfigurationEntity"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ArchiveConfigurationID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_Mode VARCHAR(20) DEFAULT NULL,
    IN p_RetentionDays INTEGER DEFAULT NULL,
    IN p_DateField VARCHAR(100) DEFAULT NULL,
    IN p_FilterExpression TEXT DEFAULT NULL,
    IN p_BatchSize INTEGER DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_FieldConfiguration TEXT DEFAULT NULL,
    IN p_DriverClass VARCHAR(500) DEFAULT NULL,
    IN p_ArchiveRelatedRecordChanges BOOLEAN DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwArchiveConfigurationEntities" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ArchiveConfigurationEntity"
            (
                "ID",
                "ArchiveConfigurationID",
                "EntityID",
                "Mode",
                "RetentionDays",
                "DateField",
                "FilterExpression",
                "BatchSize",
                "Priority",
                "FieldConfiguration",
                "DriverClass",
                "ArchiveRelatedRecordChanges",
                "IsActive"
            )
        VALUES
            (
                p_ID,
                p_ArchiveConfigurationID,
                p_EntityID,
                p_Mode,
                p_RetentionDays,
                COALESCE(p_DateField, '__mj_CreatedAt'),
                p_FilterExpression,
                p_BatchSize,
                COALESCE(p_Priority, 100),
                p_FieldConfiguration,
                p_DriverClass,
                p_ArchiveRelatedRecordChanges,
                COALESCE(p_IsActive, TRUE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ArchiveConfigurationEntity"
            (
                "ArchiveConfigurationID",
                "EntityID",
                "Mode",
                "RetentionDays",
                "DateField",
                "FilterExpression",
                "BatchSize",
                "Priority",
                "FieldConfiguration",
                "DriverClass",
                "ArchiveRelatedRecordChanges",
                "IsActive"
            )
        VALUES
            (
                p_ArchiveConfigurationID,
                p_EntityID,
                p_Mode,
                p_RetentionDays,
                COALESCE(p_DateField, '__mj_CreatedAt'),
                p_FilterExpression,
                p_BatchSize,
                COALESCE(p_Priority, 100),
                p_FieldConfiguration,
                p_DriverClass,
                p_ArchiveRelatedRecordChanges,
                COALESCE(p_IsActive, TRUE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwArchiveConfigurationEntities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArchiveConfigurationEntity"(
    IN p_ID UUID,
    IN p_ArchiveConfigurationID UUID,
    IN p_EntityID UUID,
    IN p_Mode VARCHAR(20),
    IN p_RetentionDays INTEGER,
    IN p_DateField VARCHAR(100),
    IN p_FilterExpression TEXT,
    IN p_BatchSize INTEGER,
    IN p_Priority INTEGER,
    IN p_FieldConfiguration TEXT,
    IN p_DriverClass VARCHAR(500),
    IN p_ArchiveRelatedRecordChanges BOOLEAN,
    IN p_IsActive BOOLEAN
)
RETURNS SETOF __mj."vwArchiveConfigurationEntities" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ArchiveConfigurationEntity"
    SET
        "ArchiveConfigurationID" = p_ArchiveConfigurationID,
        "EntityID" = p_EntityID,
        "Mode" = p_Mode,
        "RetentionDays" = p_RetentionDays,
        "DateField" = p_DateField,
        "FilterExpression" = p_FilterExpression,
        "BatchSize" = p_BatchSize,
        "Priority" = p_Priority,
        "FieldConfiguration" = p_FieldConfiguration,
        "DriverClass" = p_DriverClass,
        "ArchiveRelatedRecordChanges" = p_ArchiveRelatedRecordChanges,
        "IsActive" = p_IsActive
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwArchiveConfigurationEntities" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwArchiveConfigurationEntities" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArchiveConfigurationEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArchiveConfigurationEntity"
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

CREATE OR REPLACE FUNCTION __mj."spCreateArchiveRun"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ArchiveConfigurationID UUID DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_TotalRecords INTEGER DEFAULT NULL,
    IN p_ArchivedRecords INTEGER DEFAULT NULL,
    IN p_FailedRecords INTEGER DEFAULT NULL,
    IN p_SkippedRecords INTEGER DEFAULT NULL,
    IN p_TotalBytesArchived BIGINT DEFAULT NULL,
    IN p_ErrorLog TEXT DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwArchiveRuns" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ArchiveRun"
            (
                "ID",
                "ArchiveConfigurationID",
                "StartedAt",
                "CompletedAt",
                "Status",
                "TotalRecords",
                "ArchivedRecords",
                "FailedRecords",
                "SkippedRecords",
                "TotalBytesArchived",
                "ErrorLog",
                "UserID"
            )
        VALUES
            (
                p_ID,
                p_ArchiveConfigurationID,
                COALESCE(p_StartedAt, NOW()),
                p_CompletedAt,
                COALESCE(p_Status, 'Running'),
                COALESCE(p_TotalRecords, 0),
                COALESCE(p_ArchivedRecords, 0),
                COALESCE(p_FailedRecords, 0),
                COALESCE(p_SkippedRecords, 0),
                COALESCE(p_TotalBytesArchived, 0),
                p_ErrorLog,
                p_UserID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ArchiveRun"
            (
                "ArchiveConfigurationID",
                "StartedAt",
                "CompletedAt",
                "Status",
                "TotalRecords",
                "ArchivedRecords",
                "FailedRecords",
                "SkippedRecords",
                "TotalBytesArchived",
                "ErrorLog",
                "UserID"
            )
        VALUES
            (
                p_ArchiveConfigurationID,
                COALESCE(p_StartedAt, NOW()),
                p_CompletedAt,
                COALESCE(p_Status, 'Running'),
                COALESCE(p_TotalRecords, 0),
                COALESCE(p_ArchivedRecords, 0),
                COALESCE(p_FailedRecords, 0),
                COALESCE(p_SkippedRecords, 0),
                COALESCE(p_TotalBytesArchived, 0),
                p_ErrorLog,
                p_UserID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwArchiveRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArchiveRun"(
    IN p_ID UUID,
    IN p_ArchiveConfigurationID UUID,
    IN p_StartedAt TIMESTAMPTZ,
    IN p_CompletedAt TIMESTAMPTZ,
    IN p_Status VARCHAR(50),
    IN p_TotalRecords INTEGER,
    IN p_ArchivedRecords INTEGER,
    IN p_FailedRecords INTEGER,
    IN p_SkippedRecords INTEGER,
    IN p_TotalBytesArchived BIGINT,
    IN p_ErrorLog TEXT,
    IN p_UserID UUID
)
RETURNS SETOF __mj."vwArchiveRuns" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ArchiveRun"
    SET
        "ArchiveConfigurationID" = p_ArchiveConfigurationID,
        "StartedAt" = p_StartedAt,
        "CompletedAt" = p_CompletedAt,
        "Status" = p_Status,
        "TotalRecords" = p_TotalRecords,
        "ArchivedRecords" = p_ArchivedRecords,
        "FailedRecords" = p_FailedRecords,
        "SkippedRecords" = p_SkippedRecords,
        "TotalBytesArchived" = p_TotalBytesArchived,
        "ErrorLog" = p_ErrorLog,
        "UserID" = p_UserID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwArchiveRuns" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwArchiveRuns" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArchiveRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArchiveRun"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateArchiveConfiguration_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateArchiveConfiguration" ON __mj."ArchiveConfiguration";
CREATE TRIGGER "trgUpdateArchiveConfiguration"
    BEFORE UPDATE ON __mj."ArchiveConfiguration"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateArchiveConfiguration_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateArchiveConfigurationEntity_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateArchiveConfigurationEntity" ON __mj."ArchiveConfigurationEntity";
CREATE TRIGGER "trgUpdateArchiveConfigurationEntity"
    BEFORE UPDATE ON __mj."ArchiveConfigurationEntity"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateArchiveConfigurationEntity_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateArchiveRun_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateArchiveRun" ON __mj."ArchiveRun";
CREATE TRIGGER "trgUpdateArchiveRun"
    BEFORE UPDATE ON __mj."ArchiveRun"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateArchiveRun_func"();


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
         '83dbf4cb-56fe-496f-a5df-1fc7bf616653',
         'MJ: Archive Configuration Entities',
         'Archive Configuration Entities',
         'Per-entity configuration within an archive pipeline. Allows overriding the parent configuration''s defaults for mode, retention, batch size, and filtering on a per-entity basis.',
         NULL,
         'ArchiveConfigurationEntity',
         'vwArchiveConfigurationEntities',
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
/* SQL generated to add new permission for entity MJ: Archive Configuration Entities for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('83dbf4cb-56fe-496f-a5df-1fc7bf616653', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Archive Configuration Entities for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('83dbf4cb-56fe-496f-a5df-1fc7bf616653', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Archive Configuration Entities for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('83dbf4cb-56fe-496f-a5df-1fc7bf616653', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Archive Runs */

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
         '3f740d68-8510-46a6-a1d3-3fa5d79eb7c4',
         'MJ: Archive Runs',
         'Archive Runs',
         'Tracks each execution of an archive configuration, including timing, aggregate statistics, and overall status.',
         NULL,
         'ArchiveRun',
         'vwArchiveRuns',
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
/* SQL generated to add new permission for entity MJ: Archive Runs for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3f740d68-8510-46a6-a1d3-3fa5d79eb7c4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Archive Runs for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3f740d68-8510-46a6-a1d3-3fa5d79eb7c4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Archive Runs for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3f740d68-8510-46a6-a1d3-3fa5d79eb7c4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Archive Run Details */

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
         'c30f80ec-e7ce-468e-b6c6-b8888f0f45c6',
         'MJ: Archive Run Details',
         'Archive Run Details',
         'Per-record detail for each archive run. Tracks the outcome, storage location, and error information for each individual record processed.',
         NULL,
         'ArchiveRunDetail',
         'vwArchiveRunDetails',
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
/* SQL generated to add new permission for entity MJ: Archive Run Details for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c30f80ec-e7ce-468e-b6c6-b8888f0f45c6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Archive Run Details for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c30f80ec-e7ce-468e-b6c6-b8888f0f45c6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Archive Run Details for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c30f80ec-e7ce-468e-b6c6-b8888f0f45c6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Archive Configurations */

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
         '4873b8b1-11e9-49e7-ac26-497c17c9cd04',
         'MJ: Archive Configurations',
         'Archive Configurations',
         'Top-level configuration for an archive pipeline. Defines the storage target, default retention policy, archive format, and operational mode for archiving entity records.',
         NULL,
         'ArchiveConfiguration',
         'vwArchiveConfigurations',
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
/* SQL generated to add new permission for entity MJ: Archive Configurations for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('4873b8b1-11e9-49e7-ac26-497c17c9cd04', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Archive Configurations for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('4873b8b1-11e9-49e7-ac26-497c17c9cd04', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Archive Configurations for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('4873b8b1-11e9-49e7-ac26-497c17c9cd04', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveConfigurationEntity" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveConfigurationEntity" */
UPDATE __mj."ArchiveConfigurationEntity" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveConfigurationEntity" */
ALTER TABLE __mj."ArchiveConfigurationEntity" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ArchiveConfigurationEntity"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveConfigurationEntity" */
UPDATE __mj."ArchiveConfigurationEntity" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveConfigurationEntity" */
ALTER TABLE __mj."ArchiveConfigurationEntity" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ArchiveConfigurationEntity"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveRun" */
UPDATE __mj."ArchiveRun" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveRun" */
ALTER TABLE __mj."ArchiveRun" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ArchiveRun"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveRun" */
UPDATE __mj."ArchiveRun" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveRun" */
ALTER TABLE __mj."ArchiveRun" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ArchiveRun"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveConfiguration" */
UPDATE __mj."ArchiveConfiguration" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveConfiguration" */
ALTER TABLE __mj."ArchiveConfiguration" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ArchiveConfiguration"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveConfiguration" */
UPDATE __mj."ArchiveConfiguration" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveConfiguration" */
ALTER TABLE __mj."ArchiveConfiguration" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ArchiveConfiguration"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveRunDetail" */
UPDATE __mj."ArchiveRunDetail" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ArchiveRunDetail" */
ALTER TABLE __mj."ArchiveRunDetail" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ArchiveRunDetail"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveRunDetail" */
UPDATE __mj."ArchiveRunDetail" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ArchiveRunDetail" */
ALTER TABLE __mj."ArchiveRunDetail" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ArchiveRunDetail"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0a7127c1-e2a8-43cf-88e1-66188c8ee78c' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'ID')
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
        '0a7127c1-e2a8-43cf-88e1-66188c8ee78c',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f6a85835-b56d-46b0-a0f2-9e8dec267321' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'ArchiveConfigurationID')
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
        'f6a85835-b56d-46b0-a0f2-9e8dec267321',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100002,
        'ArchiveConfigurationID',
        'Archive Configuration ID',
        'Foreign key to the parent ArchiveConfiguration.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32659e98-d836-41c5-b667-50bcf2a83267' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'EntityID')
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
        '32659e98-d836-41c5-b667-50bcf2a83267',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100003,
        'EntityID',
        'Entity ID',
        'Foreign key to the Entity being archived.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'E0238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd3bfb0dd-1706-4f61-9d17-c4117dc6fa19' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'Mode')
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
        'd3bfb0dd-1706-4f61-9d17-c4117dc6fa19',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100004,
        'Mode',
        'Mode',
        'Archive mode override for this entity. NULL inherits from the parent configuration''s DefaultMode.',
        'TEXT',
        40,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '47b76d58-94f3-4faf-8b4e-e30b9a5ec6e7' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'RetentionDays')
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
        '47b76d58-94f3-4faf-8b4e-e30b9a5ec6e7',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100005,
        'RetentionDays',
        'Retention Days',
        'Retention period override in days. NULL inherits from the parent configuration''s DefaultRetentionDays.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5fcf20b0-6e5b-4b2e-b46a-57d614232084' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'DateField')
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
        '5fcf20b0-6e5b-4b2e-b46a-57d614232084',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100006,
        'DateField',
        'Date Field',
        'The date field on the entity used to determine record age for retention policy evaluation. Defaults to __mj_CreatedAt.',
        'TEXT',
        200,
        0,
        0,
        FALSE,
        '__mj_CreatedAt',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '41930e98-fa34-4afe-97d8-8a232738cdc3' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'FilterExpression')
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
        '41930e98-fa34-4afe-97d8-8a232738cdc3',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100007,
        'FilterExpression',
        'Filter Expression',
        'Optional SQL WHERE clause fragment to further filter which records are eligible for archiving (e.g., "Status = ''Closed''").',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '219ac061-e392-463e-8cd1-572d7989caa4' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'BatchSize')
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
        '219ac061-e392-463e-8cd1-572d7989caa4',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100008,
        'BatchSize',
        'Batch Size',
        'Batch size override for this entity. NULL inherits from the parent configuration''s DefaultBatchSize.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b305f765-7163-4a24-87ce-0409f602a0dd' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'Priority')
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
        'b305f765-7163-4a24-87ce-0409f602a0dd',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100009,
        'Priority',
        'Priority',
        'Processing priority — lower numbers are archived first. Default is 100.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e5b5487c-eb51-434f-8581-105f43063060' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'FieldConfiguration')
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
        'e5b5487c-eb51-434f-8581-105f43063060',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100010,
        'FieldConfiguration',
        'Field Configuration',
        'JSON configuration specifying which fields to include/exclude in the archive output. Required for all modes.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2fc9f585-16e5-4d7b-83b7-eb90060bad11' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'DriverClass')
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
        '2fc9f585-16e5-4d7b-83b7-eb90060bad11',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100011,
        'DriverClass',
        'Driver Class',
        'Optional fully-qualified class name of a custom archive driver to use for this entity, overriding the default archiver.',
        'TEXT',
        1000,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '71a0c823-bf0d-4648-b365-5810cbaff0d9' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'ArchiveRelatedRecordChanges')
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
        '71a0c823-bf0d-4648-b365-5810cbaff0d9',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100012,
        'ArchiveRelatedRecordChanges',
        'Archive Related Record Changes',
        'Override for archiving related Record Changes. NULL inherits from the parent configuration.',
        'BOOLEAN',
        1,
        1,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e71da572-d710-4d7e-b4c9-0e1ddedcd439' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'IsActive')
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
        'e71da572-d710-4d7e-b4c9-0e1ddedcd439',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100013,
        'IsActive',
        'Is Active',
        'Whether this entity is active within the archive configuration.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '30a8420a-2f7e-40f0-ada9-37c30ddde715' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = '__mj_CreatedAt')
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
        '30a8420a-2f7e-40f0-ada9-37c30ddde715',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a793d822-0d77-4856-96c2-d146f2d82324' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = '__mj_UpdatedAt')
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
        'a793d822-0d77-4856-96c2-d146f2d82324',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e064419c-fcc4-4e6e-8177-53fe970abcdb' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'ID')
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
        'e064419c-fcc4-4e6e-8177-53fe970abcdb',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4c4c162a-a869-4fa1-8dc6-55d21ee78dd0' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'ArchiveConfigurationID')
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
        '4c4c162a-a869-4fa1-8dc6-55d21ee78dd0',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100002,
        'ArchiveConfigurationID',
        'Archive Configuration ID',
        'Foreign key to the ArchiveConfiguration that was executed.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '94285cb6-6afb-453a-b128-a4f205a9b95b' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'StartedAt')
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
        '94285cb6-6afb-453a-b128-a4f205a9b95b',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100003,
        'StartedAt',
        'Started At',
        'Timestamp when the archive run started.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0577b1df-283a-41a7-b1ed-e4d2a636d619' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'CompletedAt')
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
        '0577b1df-283a-41a7-b1ed-e4d2a636d619',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100004,
        'CompletedAt',
        'Completed At',
        'Timestamp when the archive run completed (NULL while still running).',
        'TIMESTAMPTZ',
        10,
        34,
        7,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ff9b2129-b236-4579-8808-2ca0d3601b82' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'Status')
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
        'ff9b2129-b236-4579-8808-2ca0d3601b82',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100005,
        'Status',
        'Status',
        'Current status: Running, Complete, Failed, Cancelled, or PartialSuccess.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        'Running',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08d99409-eddd-419d-8ce9-aaa3eae83c37' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'TotalRecords')
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
        '08d99409-eddd-419d-8ce9-aaa3eae83c37',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100006,
        'TotalRecords',
        'Total Records',
        'Total number of records identified for archiving in this run.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '64b65860-76e7-45e2-95a5-99fe6c13b494' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'ArchivedRecords')
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
        '64b65860-76e7-45e2-95a5-99fe6c13b494',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100007,
        'ArchivedRecords',
        'Archived Records',
        'Number of records successfully archived.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3197725e-031c-419e-a050-0393ee956f8e' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'FailedRecords')
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
        '3197725e-031c-419e-a050-0393ee956f8e',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100008,
        'FailedRecords',
        'Failed Records',
        'Number of records that failed to archive.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70aaf154-feb2-446b-ad07-7d135fc02d8c' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'SkippedRecords')
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
        '70aaf154-feb2-446b-ad07-7d135fc02d8c',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100009,
        'SkippedRecords',
        'Skipped Records',
        'Number of records skipped (e.g., already archived or filtered out).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6cb16169-7134-4506-853c-87d55e653827' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'TotalBytesArchived')
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
        '6cb16169-7134-4506-853c-87d55e653827',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100010,
        'TotalBytesArchived',
        'Total Bytes Archived',
        'Total bytes written to archive storage during this run.',
        'bigint',
        8,
        19,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cf29c5fd-0392-4f97-8003-63f6852645c5' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'ErrorLog')
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
        'cf29c5fd-0392-4f97-8003-63f6852645c5',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100011,
        'ErrorLog',
        'Error Log',
        'Aggregated error log for the run. Contains error details when Status is Failed or PartialSuccess.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3e3471ed-ea06-4939-bb55-f872c214744a' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'UserID')
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
        '3e3471ed-ea06-4939-bb55-f872c214744a',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100012,
        'UserID',
        'User ID',
        'The user who initiated this archive run.',
        'UUID',
        16,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '802f2dc2-32ae-4792-8031-5a95a45da99d' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = '__mj_CreatedAt')
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
        '802f2dc2-32ae-4792-8031-5a95a45da99d',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '351d3434-f7e4-407f-a043-16c1d2d3cf44' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = '__mj_UpdatedAt')
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
        '351d3434-f7e4-407f-a043-16c1d2d3cf44',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b8ceab8e-7f9d-4b3e-be61-c65768fcbdb1' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'ID')
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
        'b8ceab8e-7f9d-4b3e-be61-c65768fcbdb1',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b7d525a4-79dc-4914-9226-3589cb238ab6' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'Name')
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
        'b7d525a4-79dc-4914-9226-3589cb238ab6',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100002,
        'Name',
        'Name',
        'Human-readable name for this archive configuration.',
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f388801a-588f-49fc-8be4-a0ab120fad8b' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'Description')
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
        'f388801a-588f-49fc-8be4-a0ab120fad8b',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100003,
        'Description',
        'Description',
        NULL,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ea56758a-5a15-4782-8181-ed1aefb5f20b' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'StorageAccountID')
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
        'ea56758a-5a15-4782-8181-ed1aefb5f20b',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100004,
        'StorageAccountID',
        'Storage Account ID',
        'Foreign key to FileStorageAccount — the blob/file storage target for archived data.',
        'UUID',
        16,
        0,
        0,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '59a81384-543d-4147-8fc0-58664cea01b7' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'RootPath')
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
        '59a81384-543d-4147-8fc0-58664cea01b7',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100005,
        'RootPath',
        'Root Path',
        'Root path within the storage account where archive files are written (e.g., "archives/production/").',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fbc6b9c6-466a-4848-ab6e-df9ac86bbeca' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'ArchiveFormat')
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
        'fbc6b9c6-466a-4848-ab6e-df9ac86bbeca',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100006,
        'ArchiveFormat',
        'Archive Format',
        'Output format for archived records: JSON, Parquet, or CSV.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'JSON',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bede1ba3-98f5-44da-be96-49f0cca97251' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'IsActive')
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
        'bede1ba3-98f5-44da-be96-49f0cca97251',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100007,
        'IsActive',
        'Is Active',
        'Whether this configuration is active and eligible for scheduled archive runs.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e90d03b4-27ad-4bd1-a0a9-f26a759f2870' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'DefaultRetentionDays')
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
        'e90d03b4-27ad-4bd1-a0a9-f26a759f2870',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100008,
        'DefaultRetentionDays',
        'Default Retention Days',
        'Default number of days after which records become eligible for archiving. Can be overridden per entity.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(365)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '475ffa36-2e60-45f0-9c11-380616149b5a' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'DefaultMode')
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
        '475ffa36-2e60-45f0-9c11-380616149b5a',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100009,
        'DefaultMode',
        'Default Mode',
        'Default archive mode: StripFields (null out specified fields), HardDelete (delete from source after archiving), ArchiveOnly (copy to storage without modifying source).',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'StripFields',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c8405377-cecb-4aa6-82f8-0631eb4cfd1d' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'DefaultBatchSize')
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
        'c8405377-cecb-4aa6-82f8-0631eb4cfd1d',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100010,
        'DefaultBatchSize',
        'Default Batch Size',
        'Default number of records to process per batch during archive runs.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '932e0cd2-73fc-4fb2-b451-bc4988a80ee3' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'ArchiveRelatedRecordChanges')
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
        '932e0cd2-73fc-4fb2-b451-bc4988a80ee3',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100011,
        'ArchiveRelatedRecordChanges',
        'Archive Related Record Changes',
        'When enabled, related Record Changes entries are also archived alongside the source records.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '80f2b15e-7e56-4f6e-b86d-8fe75e810fcc' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'Status')
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
        '80f2b15e-7e56-4f6e-b86d-8fe75e810fcc',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100012,
        'Status',
        'Status',
        'Current operational status of this configuration: Idle, Running, Error, or Disabled.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Idle',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a28a545c-c728-4da1-aae5-c2f434ad6184' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'CreatedByUserID')
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
        'a28a545c-c728-4da1-aae5-c2f434ad6184',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100013,
        'CreatedByUserID',
        'Created By User ID',
        'The user who created this archive configuration.',
        'UUID',
        16,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c91a60f0-ed25-40fa-ab1e-db0b368fac7c' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = '__mj_CreatedAt')
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
        'c91a60f0-ed25-40fa-ab1e-db0b368fac7c',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a37d9dd2-5f24-4c33-95c7-335907714961' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = '__mj_UpdatedAt')
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
        'a37d9dd2-5f24-4c33-95c7-335907714961',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '79525349-f1a7-45cd-bddb-15d45e1ea4d5' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'ID')
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
        '79525349-f1a7-45cd-bddb-15d45e1ea4d5',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0c1ae9bd-d895-4ecf-b65b-43ea80d9949c' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'ArchiveRunID')
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
        '0c1ae9bd-d895-4ecf-b65b-43ea80d9949c',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100002,
        'ArchiveRunID',
        'Archive Run ID',
        'Foreign key to the parent ArchiveRun.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6170c43c-462b-42b1-972b-1d8b7789682b' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'EntityID')
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
        '6170c43c-462b-42b1-972b-1d8b7789682b',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100003,
        'EntityID',
        'Entity ID',
        'Foreign key to the Entity this record belongs to.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2cd99cc3-14ac-466e-b9d1-ce5e050b58aa' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'RecordID')
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
        '2cd99cc3-14ac-466e-b9d1-ce5e050b58aa',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100004,
        'RecordID',
        'Record ID',
        'The primary key value of the archived record (string representation to support all key types).',
        'TEXT',
        1500,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b67b2260-8850-40f9-8902-5d91d0159fe7' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'Status')
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
        'b67b2260-8850-40f9-8902-5d91d0159fe7',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100005,
        'Status',
        'Status',
        'Outcome for this record: Success, Failed, or Skipped.',
        'TEXT',
        100,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2a48a363-dc62-4dd2-833b-eb7cfbabb283' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'StoragePath')
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
        '2a48a363-dc62-4dd2-833b-eb7cfbabb283',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100006,
        'StoragePath',
        'Storage Path',
        'Full path to the archived file in storage (e.g., "archives/production/Users/2026/04/record-id.json").',
        'TEXT',
        2000,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5b53cd8f-01e4-41c3-a6e3-313a83103ecf' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'BytesArchived')
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
        '5b53cd8f-01e4-41c3-a6e3-313a83103ecf',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100007,
        'BytesArchived',
        'Bytes Archived',
        'Number of bytes written to storage for this record.',
        'bigint',
        8,
        19,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0823fbf5-191b-4799-a64e-778c6af033a1' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'ErrorMessage')
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
        '0823fbf5-191b-4799-a64e-778c6af033a1',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100008,
        'ErrorMessage',
        'Error Message',
        'Error details when Status is Failed.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bfccf263-af8a-405c-b57d-473aac8a9e90' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'ArchivedAt')
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
        'bfccf263-af8a-405c-b57d-473aac8a9e90',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100009,
        'ArchivedAt',
        'Archived At',
        'Timestamp when this record was successfully archived.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '07f192b4-3a6d-4feb-869b-6ed067bb82f0' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'VersionStamp')
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
        '07f192b4-3a6d-4feb-869b-6ed067bb82f0',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100010,
        'VersionStamp',
        'Version Stamp',
        'The __mj_UpdatedAt timestamp of the record at the time of archiving, used for conflict detection during restore.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4959b7f3-ad32-40dd-8e3f-8df97e4c6844' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'IsRecordChangeArchive')
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
        '4959b7f3-ad32-40dd-8e3f-8df97e4c6844',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100011,
        'IsRecordChangeArchive',
        'Is Record Change Archive',
        'When true, this detail row represents an archived Record Change entry rather than a primary entity record.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b90e24fd-d3a9-4d00-a94b-17e2b1fb2fe3' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = '__mj_CreatedAt')
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
        'b90e24fd-d3a9-4d00-a94b-17e2b1fb2fe3',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100012,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb7feb68-c246-4b48-9518-b8bcf5793611' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = '__mj_UpdatedAt')
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
        'eb7feb68-c246-4b48-9518-b8bcf5793611',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100013,
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
                                       ('ddf59aaa-286c-41e5-ad55-85672b11d346', 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19', 1, 'ArchiveOnly', 'ArchiveOnly', NOW(), NOW());
/* SQL text to insert entity field value with ID 1a17cdee-2ef5-4cf4-b38d-bf21deb3c573 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('1a17cdee-2ef5-4cf4-b38d-bf21deb3c573', 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19', 2, 'HardDelete', 'HardDelete', NOW(), NOW());
/* SQL text to insert entity field value with ID 5cbc4a8a-8746-4c8e-a294-33c0c70f31fd */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('5cbc4a8a-8746-4c8e-a294-33c0c70f31fd', 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19', 3, 'StripFields', 'StripFields', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID D3BFB0DD-1706-4F61-9D17-C4117DC6FA19 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='D3BFB0DD-1706-4F61-9D17-C4117DC6FA19';
/* SQL text to insert entity field value with ID fe4752d5-6e7a-42ca-a5b9-0b0ba41410d8 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('fe4752d5-6e7a-42ca-a5b9-0b0ba41410d8', 'FF9B2129-B236-4579-8808-2CA0D3601B82', 1, 'Cancelled', 'Cancelled', NOW(), NOW());
/* SQL text to insert entity field value with ID 8ef50148-d923-4dfe-a111-2414dca66eb3 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('8ef50148-d923-4dfe-a111-2414dca66eb3', 'FF9B2129-B236-4579-8808-2CA0D3601B82', 2, 'Complete', 'Complete', NOW(), NOW());
/* SQL text to insert entity field value with ID cc2b6e84-d503-45c1-8df8-7de64a618bd2 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('cc2b6e84-d503-45c1-8df8-7de64a618bd2', 'FF9B2129-B236-4579-8808-2CA0D3601B82', 3, 'Failed', 'Failed', NOW(), NOW());
/* SQL text to insert entity field value with ID 09c4d43e-84df-440f-8e3d-280c9c140cae */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('09c4d43e-84df-440f-8e3d-280c9c140cae', 'FF9B2129-B236-4579-8808-2CA0D3601B82', 4, 'PartialSuccess', 'PartialSuccess', NOW(), NOW());
/* SQL text to insert entity field value with ID 76d16afa-6153-475c-8672-e89eab16deb9 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('76d16afa-6153-475c-8672-e89eab16deb9', 'FF9B2129-B236-4579-8808-2CA0D3601B82', 5, 'Running', 'Running', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID FF9B2129-B236-4579-8808-2CA0D3601B82 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='FF9B2129-B236-4579-8808-2CA0D3601B82';
/* SQL text to insert entity field value with ID 1433c133-c843-4613-8de9-09ddd0c9473e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('1433c133-c843-4613-8de9-09ddd0c9473e', '475FFA36-2E60-45F0-9C11-380616149B5A', 1, 'ArchiveOnly', 'ArchiveOnly', NOW(), NOW());
/* SQL text to insert entity field value with ID fe70b80e-1ee4-4ead-87ef-26c633cdd6a4 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('fe70b80e-1ee4-4ead-87ef-26c633cdd6a4', '475FFA36-2E60-45F0-9C11-380616149B5A', 2, 'HardDelete', 'HardDelete', NOW(), NOW());
/* SQL text to insert entity field value with ID 120edf33-c92d-4517-afc7-476645bd5681 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('120edf33-c92d-4517-afc7-476645bd5681', '475FFA36-2E60-45F0-9C11-380616149B5A', 3, 'StripFields', 'StripFields', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 475FFA36-2E60-45F0-9C11-380616149B5A */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='475FFA36-2E60-45F0-9C11-380616149B5A';
/* SQL text to insert entity field value with ID 565bdeb8-933a-494a-a9b1-942cf1fc105a */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('565bdeb8-933a-494a-a9b1-942cf1fc105a', '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC', 1, 'Disabled', 'Disabled', NOW(), NOW());
/* SQL text to insert entity field value with ID fe487b49-7cd8-40ed-a268-fee233b3475e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('fe487b49-7cd8-40ed-a268-fee233b3475e', '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC', 2, 'Error', 'Error', NOW(), NOW());
/* SQL text to insert entity field value with ID 6b8ec2fd-69c7-4885-9aae-ff12da67a2f1 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('6b8ec2fd-69c7-4885-9aae-ff12da67a2f1', '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC', 3, 'Idle', 'Idle', NOW(), NOW());
/* SQL text to insert entity field value with ID 93c38fdc-ac46-421c-9c83-c822de8cbac6 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('93c38fdc-ac46-421c-9c83-c822de8cbac6', '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC', 4, 'Running', 'Running', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 80F2B15E-7E56-4F6E-B86D-8FE75E810FCC */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='80F2B15E-7E56-4F6E-B86D-8FE75E810FCC';
/* SQL text to insert entity field value with ID 806768b3-988f-4879-952e-b4717109c417 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('806768b3-988f-4879-952e-b4717109c417', 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA', 1, 'CSV', 'CSV', NOW(), NOW());
/* SQL text to insert entity field value with ID 7ee2d7d9-5187-4f5a-ae34-c722e2191232 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('7ee2d7d9-5187-4f5a-ae34-c722e2191232', 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA', 2, 'JSON', 'JSON', NOW(), NOW());
/* SQL text to insert entity field value with ID 779ea52c-322b-4d12-bc29-5cb2adda6061 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('779ea52c-322b-4d12-bc29-5cb2adda6061', 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA', 3, 'Parquet', 'Parquet', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA';
/* SQL text to insert entity field value with ID 844f5017-eb73-4f50-b018-a9fcf0899211 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('844f5017-eb73-4f50-b018-a9fcf0899211', 'B67B2260-8850-40F9-8902-5D91D0159FE7', 1, 'Failed', 'Failed', NOW(), NOW());
/* SQL text to insert entity field value with ID ed02490f-be4c-4161-8f52-5aa9fb78896e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ed02490f-be4c-4161-8f52-5aa9fb78896e', 'B67B2260-8850-40F9-8902-5D91D0159FE7', 2, 'Skipped', 'Skipped', NOW(), NOW());
/* SQL text to insert entity field value with ID c1a5a1dc-03d4-4367-9db8-8e7c8844b2b2 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('c1a5a1dc-03d4-4367-9db8-8e7c8844b2b2', 'B67B2260-8850-40F9-8902-5D91D0159FE7', 3, 'Success', 'Success', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID B67B2260-8850-40F9-8902-5D91D0159FE7 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='B67B2260-8850-40F9-8902-5D91D0159FE7';
/* Create Entity Relationship: MJ: Archive Runs -> MJ: Archive Run Details (One To Many via ArchiveRunID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '57e057aa-0126-4457-b12a-f7d7d95c9cd2'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('57e057aa-0126-4457-b12a-f7d7d95c9cd2', '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', 'ArchiveRunID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '500fbcf8-6146-4005-a8ca-080f18e60d4d'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('500fbcf8-6146-4005-a8ca-080f18e60d4d', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', 'ArchiveConfigurationID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '026ab5bb-b411-402e-a4a7-10a091f23a72'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('026ab5bb-b411-402e-a4a7-10a091f23a72', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', 'ArchiveConfigurationID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ad7534ed-3386-4309-b40b-15769d511dd6'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('ad7534ed-3386-4309-b40b-15769d511dd6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', 'EntityID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e32b314e-5ce7-424d-9b0b-8899a8db4d55'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('e32b314e-5ce7-424d-9b0b-8899a8db4d55', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', 'EntityID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2a0999a0-aa55-44ee-a37d-5b131bbe1327'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('2a0999a0-aa55-44ee-a37d-5b131bbe1327', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', 'CreatedByUserID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f899e09d-d0c3-4e43-8358-f88813a5f1e7'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f899e09d-d0c3-4e43-8358-f88813a5f1e7', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', 'UserID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2afc4246-7efa-48fb-b048-9ebd0d073c2b'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('2afc4246-7efa-48fb-b048-9ebd0d073c2b', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', 'StorageAccountID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b1d8ccfa-20df-4d0b-815f-0f17fa3ca4ac' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'ArchiveConfiguration')
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
        'b1d8ccfa-20df-4d0b-815f-0f17fa3ca4ac',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100031,
        'ArchiveConfiguration',
        'Archive Configuration',
        NULL,
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '652dd589-2e4d-41a1-84f3-d112e25f81b0' OR ("EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND "Name" = 'Entity')
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
        '652dd589-2e4d-41a1-84f3-d112e25f81b0',
        '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- "Entity": "MJ": "Archive" "Configuration" "Entities"
        100032,
        'Entity',
        'Entity',
        NULL,
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5aaf4984-3f9e-4773-ae4e-a6faff14e073' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'ArchiveConfiguration')
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
        '5aaf4984-3f9e-4773-ae4e-a6faff14e073',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100029,
        'ArchiveConfiguration',
        'Archive Configuration',
        NULL,
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9b94be74-4f68-4391-85a9-3ac1ccf4b8e3' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'User')
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
        '9b94be74-4f68-4391-85a9-3ac1ccf4b8e3',
        '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- "Entity": "MJ": "Archive" "Runs"
        100030,
        'User',
        'User',
        NULL,
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd9ed786a-4a2a-444b-801b-257712d54707' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'StorageAccount')
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
        'd9ed786a-4a2a-444b-801b-257712d54707',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100031,
        'StorageAccount',
        'Storage Account',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9b2ec06a-4f5f-425c-b08f-21aeeb42fb70' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'CreatedByUser')
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
        '9b2ec06a-4f5f-425c-b08f-21aeeb42fb70',
        '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- "Entity": "MJ": "Archive" "Configurations"
        100032,
        'CreatedByUser',
        'Created By User',
        NULL,
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0a500c87-f127-4776-8eef-7eca8e7a414c' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'Entity')
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
        '0a500c87-f127-4776-8eef-7eca8e7a414c',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100027,
        'Entity',
        'Entity',
        NULL,
        'TEXT',
        510,
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

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'BEDE1BA3-98F5-44DA-BE96-49F0CCA97251'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E90D03B4-27AD-4BD1-A0A9-F26A759F2870'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'B7D525A4-79DC-4914-9226-3589CB238AB6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC'
               AND "AutoUpdateUserSearchPredicate" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '5AAF4984-3F9E-4773-AE4E-A6FAFF14E073'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '94285CB6-6AFB-453A-B128-A4F205A9B95B'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '94285CB6-6AFB-453A-B128-A4F205A9B95B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'FF9B2129-B236-4579-8808-2CA0D3601B82'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '08D99409-EDDD-419D-8CE9-AAA3EAE83C37'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '64B65860-76E7-45E2-95A5-99FE6C13B494'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5AAF4984-3F9E-4773-AE4E-A6FAFF14E073'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'FF9B2129-B236-4579-8808-2CA0D3601B82'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '5AAF4984-3F9E-4773-AE4E-A6FAFF14E073'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '9B94BE74-4F68-4391-85A9-3AC1CCF4B8E3'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'FF9B2129-B236-4579-8808-2CA0D3601B82'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '9B94BE74-4F68-4391-85A9-3AC1CCF4B8E3'
               AND "AutoUpdateUserSearchPredicate" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B67B2260-8850-40F9-8902-5D91D0159FE7'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5B53CD8F-01E4-41C3-A6E3-313A83103ECF'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'BFCCF263-AF8A-405C-B57D-473AAC8A9E90'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '0A500C87-F127-4776-8EEF-7ECA8E7A414C'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'B67B2260-8850-40F9-8902-5D91D0159FE7'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '0A500C87-F127-4776-8EEF-7ECA8E7A414C'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '0A500C87-F127-4776-8EEF-7ECA8E7A414C'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'B67B2260-8850-40F9-8902-5D91D0159FE7'
               AND "AutoUpdateUserSearchPredicate" = TRUE;
/* Set categories for 14 fields */
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '79525349-F1A7-45CD-BDDB-15D45E1EA4D5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ArchiveRunID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Archive Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0C1AE9BD-D895-4ECF-B65B-43EA80D9949C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."EntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Record',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6170C43C-462B-42B1-972B-1D8B7789682B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."Entity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0A500C87-F127-4776-8EEF-7ECA8E7A414C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."RecordID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Context',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Results',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B67B2260-8850-40F9-8902-5D91D0159FE7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."StoragePath"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Results',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = '2A48A363-DC62-4DD2-833B-EB7CFBABB283' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."BytesArchived"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Results',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5B53CD8F-01E4-41C3-A6E3-313A83103ECF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ErrorMessage"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Results',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0823FBF5-191B-4799-A64E-778C6AF033A1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ArchivedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Timeline and Versioning',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BFCCF263-AF8A-405C-B57D-473AAC8A9E90' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."VersionStamp"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Timeline and Versioning',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '07F192B4-3A6D-4FEB-869B-6ED067BB82F0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."IsRecordChangeArchive"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Timeline and Versioning',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4959B7F3-AD32-40DD-8E3F-8DF97E4C6844' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B90E24FD-D3A9-4D00-A94B-17E2B1FB2FE3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EB7FEB68-C246-4B48-9518-B8BCF5793611' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-archive */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-archive', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('fcbece2e-0ff0-4bf9-923d-897107971763', 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', 'FieldCategoryInfo', '{"Archive Context":{"icon":"fa fa-link","description":"Links and identifiers relating this record to the archive operation and source entity."},"Processing Results":{"icon":"fa fa-check-circle","description":"Outcome, storage location, and error details of the archive process."},"Timeline and Versioning":{"icon":"fa fa-history","description":"Timestamps and versioning data used for audit and restore operations."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('4db5dffa-a2b6-4696-aba9-aadcca74c50f', 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', 'FieldCategoryIcons', '{"Archive Context":"fa fa-link","Processing Results":"fa fa-check-circle","Timeline and Versioning":"fa fa-history","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6';
/* Set categories for 16 fields */
-- UPDATE Entity Field Category Info MJ: Archive Runs."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E064419C-FCC4-4E6E-8177-53FE970ABCDB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."ArchiveConfigurationID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Archive Configuration',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4C4C162A-A869-4FA1-8DC6-55D21EE78DD0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."ArchiveConfiguration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Configuration Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5AAF4984-3F9E-4773-AE4E-A6FAFF14E073' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."UserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Initiated By',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3E3471ED-EA06-4939-BB55-F872C214744A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."User"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9B94BE74-4F68-4391-85A9-3AC1CCF4B8E3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Status and Timing',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FF9B2129-B236-4579-8808-2CA0D3601B82' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."StartedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Status and Timing',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '94285CB6-6AFB-453A-B128-A4F205A9B95B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."CompletedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Status and Timing',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0577B1DF-283A-41A7-B1ED-E4D2A636D619' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."TotalRecords"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Statistics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '08D99409-EDDD-419D-8CE9-AAA3EAE83C37' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."ArchivedRecords"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Statistics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '64B65860-76E7-45E2-95A5-99FE6C13B494' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."FailedRecords"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Statistics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3197725E-031C-419E-A050-0393EE956F8E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."SkippedRecords"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Statistics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '70AAF154-FEB2-446B-AD07-7D135FC02D8C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."TotalBytesArchived"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Statistics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6CB16169-7134-4506-853C-87D55E653827' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs."ErrorLog"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Error Diagnostics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'CF29C5FD-0392-4F97-8003-63F6852645C5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '802F2DC2-32AE-4792-8031-5A95A45DA99D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Runs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '351D3434-F7E4-407F-A043-16C1D2D3CF44' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-archive */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-archive', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('7adbe01f-89f0-41d9-a542-632cf695762e', '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', 'FieldCategoryInfo', '{"Execution Context":{"icon":"fa fa-info-circle","description":"Information regarding the configuration and user associated with the archive run"},"Run Status and Timing":{"icon":"fa fa-clock","description":"Operational status and timestamp tracking for the archive execution"},"Archive Statistics":{"icon":"fa fa-chart-line","description":"Quantitative metrics regarding records processed and data volume"},"Error Diagnostics":{"icon":"fa fa-exclamation-triangle","description":"Technical logs and error details for failed or partial runs"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('fcc3e434-840b-43d7-aa73-5ae9fcafba5a', '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', 'FieldCategoryIcons', '{"Execution Context":"fa fa-info-circle","Run Status and Timing":"fa fa-clock","Archive Statistics":"fa fa-chart-line","Error Diagnostics":"fa fa-exclamation-triangle","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=1 for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4';
/* Set categories for 17 fields */
-- UPDATE Entity Field Category Info MJ: Archive Configurations."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B8CEAB8E-7F9D-4B3E-BE61-C65768FCBDB1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'General Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B7D525A4-79DC-4914-9226-3589CB238AB6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'General Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F388801A-588F-49FC-8BE4-A0AB120FAD8B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."IsActive"

UPDATE __mj."EntityField"
SET 
   "Category" = 'General Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BEDE1BA3-98F5-44DA-BE96-49F0CCA97251' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'General Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."StorageAccountID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Storage Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Storage Account',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EA56758A-5A15-4782-8181-ED1AEFB5F20B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."StorageAccount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Storage Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Storage Account Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D9ED786A-4A2A-444B-801B-257712D54707' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."RootPath"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Storage Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '59A81384-543D-4147-8FC0-58664CEA01B7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."ArchiveFormat"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."DefaultRetentionDays"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E90D03B4-27AD-4BD1-A0A9-F26A759F2870' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."DefaultMode"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '475FFA36-2E60-45F0-9C11-380616149B5A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."DefaultBatchSize"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C8405377-CECB-4AA6-82F8-0631EB4CFD1D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."ArchiveRelatedRecordChanges"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '932E0CD2-73FC-4FB2-B451-BC4988A80EE3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."CreatedByUserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A28A545C-C728-4DA1-AAE5-C2F434AD6184' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations."CreatedByUser"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9B2EC06A-4F5F-425C-B08F-21AEEB42FB70' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C91A60F0-ED25-40FA-AB1E-DB0B368FAC7C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configurations.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A37D9DD2-5F24-4C33-95C7-335907714961' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-archive */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-archive', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('a235ec6b-f039-4fd9-9abd-3fbb9ebdd0cf', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', 'FieldCategoryInfo', '{"General Information":{"icon":"fa fa-info-circle","description":"Basic identification and operational status of the archive configuration"},"Storage Configuration":{"icon":"fa fa-database","description":"Settings defining where and how archive files are stored"},"Archive Settings":{"icon":"fa fa-sliders-h","description":"Rules for formatting, retention, and processing of archived data"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('0fb3c94d-16ef-4d30-b50a-d7408ae06503', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', 'FieldCategoryIcons', '{"General Information":"fa fa-info-circle","Storage Configuration":"fa fa-database","Archive Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=1 for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04';
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '652DD589-2E4D-41A1-84F3-D112E25F81B0'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B305F765-7163-4A24-87CE-0409F602A0DD'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E71DA572-D710-4D7E-B4C9-0E1DDEDCD439'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B1D8CCFA-20DF-4D0B-815F-0F17FA3CA4AC'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '652DD589-2E4D-41A1-84F3-D112E25F81B0'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'B1D8CCFA-20DF-4D0B-815F-0F17FA3CA4AC'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '652DD589-2E4D-41A1-84F3-D112E25F81B0'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '652DD589-2E4D-41A1-84F3-D112E25F81B0'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'B1D8CCFA-20DF-4D0B-815F-0F17FA3CA4AC'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19'
               AND "AutoUpdateUserSearchPredicate" = TRUE;
/* Set categories for 17 fields */
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0A7127C1-E2A8-43CF-88E1-66188C8EE78C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."ArchiveConfigurationID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Relationships',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Archive Configuration',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F6A85835-B56D-46B0-A0F2-9E8DEC267321' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."EntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Relationships',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '32659E98-D836-41C5-B667-50BCF2A83267' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."Mode"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Policies',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Archive Mode',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."RetentionDays"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Policies',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '47B76D58-94F3-4FAF-8B4E-E30B9A5EC6E7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."DateField"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Policies',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5FCF20B0-6E5B-4B2E-B46A-57D614232084' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."FilterExpression"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Policies',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '41930E98-FA34-4AFE-97D8-8A232738CDC3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."BatchSize"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '219AC061-E392-463E-8CD1-572D7989CAA4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."Priority"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B305F765-7163-4A24-87CE-0409F602A0DD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."FieldConfiguration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'E5B5487C-EB51-434F-8581-105F43063060' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."DriverClass"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2FC9F585-16E5-4D7B-83B7-EB90060BAD11' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."ArchiveRelatedRecordChanges"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Policies',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '71A0C823-BF0D-4648-B365-5810CBAFF0D9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."IsActive"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E71DA572-D710-4D7E-B4C9-0E1DDEDCD439' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '30A8420A-2F7E-40F0-ADA9-37C30DDDE715' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A793D822-0D77-4856-96C2-D146F2D82324' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."ArchiveConfiguration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Relationships',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Archive Configuration Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B1D8CCFA-20DF-4D0B-815F-0F17FA3CA4AC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities."Entity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Relationships',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '652DD589-2E4D-41A1-84F3-D112E25F81B0' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-archive */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-archive', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('a273de8b-0957-4660-b07c-aa1dcb0b2d7e', '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', 'FieldCategoryInfo', '{"Relationships":{"icon":"fa fa-link","description":"Links to parent archive configurations and target entities"},"Archive Policies":{"icon":"fa fa-shield-alt","description":"Rules governing data retention and filtering logic"},"Processing Settings":{"icon":"fa fa-sliders-h","description":"Operational parameters for the archive execution pipeline"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('ae282aba-18d7-484e-8851-6033f5bc7edb', '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', 'FieldCategoryIcons', '{"Relationships":"fa fa-link","Archive Policies":"fa fa-shield-alt","Processing Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653';
-- Migration: Create Archiving Application and reassign Archive Entities
-- Description: Creates the "Archiving" application with its default nav items
--              (Configuration and Run History dashboards), then assigns the
--              four Archive entities to the
--              new Archiving application.
--

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."Application" WHERE "ID" = '87B3923D-6505-4E5C-A486-CA554CB6A0F0'::UUID
    ) THEN
        INSERT INTO __mj."Application"
        ("ID", "Name", "Description", "Icon", "DefaultForNewUser", "DefaultSequence",
        "Status", "NavigationStyle", "HideNavBarIconWhenActive", "Path", "AutoUpdatePath",
        "DefaultNavItems")
        VALUES
        ('87B3923D-6505-4E5C-A486-CA554CB6A0F0'::UUID,
        'Archiving',
        'Manage database archiving configurations, view run history, and restore archived records.',
        'fa-solid fa-box-archive',
        FALSE,       -- "DefaultForNewUser"
        1050,    -- "DefaultSequence"
        'Active',
        'Both',
        TRUE,       -- "HideNavBarIconWhenActive"
        'archiving',
        TRUE,       -- "AutoUpdatePath"
        '[{"Label":"Configuration","Icon":"fa-solid fa-sliders","ResourceType":"Custom","DriverClass":"ArchiveConfigResource","isDefault":true},{"Label":"Run History","Icon":"fa-solid fa-clock-rotate-left","ResourceType":"Custom","DriverClass":"ArchiveRunsResource"}]');
    END IF;
END $$;

INSERT INTO __mj."ApplicationEntity"
    ("ApplicationID", "EntityID", "Sequence", "DefaultForNewUser")
VALUES
    ('87B3923D-6505-4E5C-A486-CA554CB6A0F0'::UUID, '4873b8b1-11e9-49e7-ac26-497c17c9cd04'::UUID,    1, TRUE),
    ('87B3923D-6505-4E5C-A486-CA554CB6A0F0'::UUID, '83dbf4cb-56fe-496f-a5df-1fc7bf616653'::UUID, 2, FALSE),
    ('87B3923D-6505-4E5C-A486-CA554CB6A0F0'::UUID, '3f740d68-8510-46a6-a1d3-3fa5d79eb7c4'::UUID,       3, TRUE),
    ('87B3923D-6505-4E5C-A486-CA554CB6A0F0'::UUID, 'c30f80ec-e7ce-468e-b6c6-b8888f0f45c6'::UUID, 4, FALSE);


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
/* SQL text to update entity field related entity name field map for entity field ID A28A545C-C728-4DA1-AAE5-C2F434AD6184 */

DO $$ BEGIN GRANT SELECT ON __mj."vwArchiveConfigurations" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: Permissions for vwArchiveConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArchiveConfigurations" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: spCreateArchiveConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveConfiguration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArchiveConfiguration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Archive Configurations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArchiveConfiguration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: spUpdateArchiveConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveConfiguration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArchiveConfiguration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArchiveConfiguration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: spDeleteArchiveConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveConfiguration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Archive Configurations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Archive Configuration Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: vwArchiveConfigurationEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Archive Configuration Entities
-----               SCHEMA:      __mj
-----               BASE TABLE:  ArchiveConfigurationEntity
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArchiveConfigurationEntities" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Archive Configuration Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: Permissions for vwArchiveConfigurationEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArchiveConfigurationEntities" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Archive Configuration Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: spCreateArchiveConfigurationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveConfigurationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArchiveConfigurationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Archive Configuration Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArchiveConfigurationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Archive Configuration Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: spUpdateArchiveConfigurationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveConfigurationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArchiveConfigurationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArchiveConfigurationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Archive Configuration Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: spDeleteArchiveConfigurationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveConfigurationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveConfigurationEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Archive Configuration Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveConfigurationEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for ArchiveRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArchiveConfigurationID in table ArchiveRun;

DO $$ BEGIN GRANT SELECT ON __mj."vwArchiveRuns" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Archive Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: Permissions for vwArchiveRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArchiveRuns" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Archive Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: spCreateArchiveRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArchiveRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Archive Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArchiveRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Archive Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: spUpdateArchiveRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArchiveRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArchiveRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Archive Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: spDeleteArchiveRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Archive Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON TABLE __mj."ArchiveConfiguration" IS 'Top-level configuration for an archive pipeline. Defines the storage target, default retention policy, archive format, and operational mode for archiving entity records.';

COMMENT ON COLUMN __mj."ArchiveConfiguration"."Name" IS 'Human-readable name for this archive configuration.';

COMMENT ON COLUMN __mj."ArchiveConfiguration"."StorageAccountID" IS 'Foreign key to FileStorageAccount — the blob/file storage target for archived data.';

COMMENT ON COLUMN __mj."ArchiveConfiguration"."RootPath" IS 'Root path within the storage account where archive files are written (e.g., "archives/production/").';

COMMENT ON COLUMN __mj."ArchiveConfiguration"."ArchiveFormat" IS 'Output format for archived records: JSON, Parquet, or CSV.';

COMMENT ON COLUMN __mj."ArchiveConfiguration"."IsActive" IS 'Whether this configuration is active and eligible for scheduled archive runs.';

COMMENT ON COLUMN __mj."ArchiveConfiguration"."DefaultRetentionDays" IS 'Default number of days after which records become eligible for archiving. Can be overridden per entity.';

COMMENT ON COLUMN __mj."ArchiveConfiguration"."DefaultMode" IS 'Default archive mode: StripFields (null out specified fields), HardDelete (delete from source after archiving), ArchiveOnly (copy to storage without modifying source).';

COMMENT ON COLUMN __mj."ArchiveConfiguration"."DefaultBatchSize" IS 'Default number of records to process per batch during archive runs.';

COMMENT ON COLUMN __mj."ArchiveConfiguration"."ArchiveRelatedRecordChanges" IS 'When enabled, related Record Changes entries are also archived alongside the source records.';

COMMENT ON COLUMN __mj."ArchiveConfiguration"."Status" IS 'Current operational status of this configuration: Idle, Running, Error, or Disabled.';

COMMENT ON COLUMN __mj."ArchiveConfiguration"."CreatedByUserID" IS 'The user who created this archive configuration.';

COMMENT ON TABLE __mj."ArchiveConfigurationEntity" IS 'Per-entity configuration within an archive pipeline. Allows overriding the parent configuration';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."ArchiveConfigurationID" IS 'Foreign key to the parent ArchiveConfiguration.';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."EntityID" IS 'Foreign key to the Entity being archived.';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."Mode" IS 'Archive mode override for this entity. NULL inherits from the parent configuration';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."RetentionDays" IS 'Retention period override in days. NULL inherits from the parent configuration';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."DateField" IS 'The date field on the entity used to determine record age for retention policy evaluation. Defaults to __mj_CreatedAt.';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."FilterExpression" IS 'Optional SQL WHERE clause fragment to further filter which records are eligible for archiving (e.g., "Status = ';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."BatchSize" IS 'Batch size override for this entity. NULL inherits from the parent configuration';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."Priority" IS 'Processing priority — lower numbers are archived first. Default is 100.';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."FieldConfiguration" IS 'JSON configuration specifying which fields to include/exclude in the archive output. Required for all modes.';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."DriverClass" IS 'Optional fully-qualified class name of a custom archive driver to use for this entity, overriding the default archiver.';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."ArchiveRelatedRecordChanges" IS 'Override for archiving related Record Changes. NULL inherits from the parent configuration.';

COMMENT ON COLUMN __mj."ArchiveConfigurationEntity"."IsActive" IS 'Whether this entity is active within the archive configuration.';

COMMENT ON TABLE __mj."ArchiveRun" IS 'Tracks each execution of an archive configuration, including timing, aggregate statistics, and overall status.';

COMMENT ON COLUMN __mj."ArchiveRun"."ArchiveConfigurationID" IS 'Foreign key to the ArchiveConfiguration that was executed.';

COMMENT ON COLUMN __mj."ArchiveRun"."StartedAt" IS 'Timestamp when the archive run started.';

COMMENT ON COLUMN __mj."ArchiveRun"."CompletedAt" IS 'Timestamp when the archive run completed (NULL while still running).';

COMMENT ON COLUMN __mj."ArchiveRun"."Status" IS 'Current status: Running, Complete, Failed, Cancelled, or PartialSuccess.';

COMMENT ON COLUMN __mj."ArchiveRun"."TotalRecords" IS 'Total number of records identified for archiving in this run.';

COMMENT ON COLUMN __mj."ArchiveRun"."ArchivedRecords" IS 'Number of records successfully archived.';

COMMENT ON COLUMN __mj."ArchiveRun"."FailedRecords" IS 'Number of records that failed to archive.';

COMMENT ON COLUMN __mj."ArchiveRun"."SkippedRecords" IS 'Number of records skipped (e.g., already archived or filtered out).';

COMMENT ON COLUMN __mj."ArchiveRun"."TotalBytesArchived" IS 'Total bytes written to archive storage during this run.';

COMMENT ON COLUMN __mj."ArchiveRun"."ErrorLog" IS 'Aggregated error log for the run. Contains error details when Status is Failed or PartialSuccess.';

COMMENT ON COLUMN __mj."ArchiveRun"."UserID" IS 'The user who initiated this archive run.';

COMMENT ON TABLE __mj."ArchiveRunDetail" IS 'Per-record detail for each archive run. Tracks the outcome, storage location, and error information for each individual record processed.';

COMMENT ON COLUMN __mj."ArchiveRunDetail"."ArchiveRunID" IS 'Foreign key to the parent ArchiveRun.';

COMMENT ON COLUMN __mj."ArchiveRunDetail"."EntityID" IS 'Foreign key to the Entity this record belongs to.';

COMMENT ON COLUMN __mj."ArchiveRunDetail"."RecordID" IS 'The primary key value of the archived record (string representation to support all key types).';

COMMENT ON COLUMN __mj."ArchiveRunDetail"."Status" IS 'Outcome for this record: Success, Failed, or Skipped.';

COMMENT ON COLUMN __mj."ArchiveRunDetail"."StoragePath" IS 'Full path to the archived file in storage (e.g., "archives/production/Users/2026/04/record-id.json").';

COMMENT ON COLUMN __mj."ArchiveRunDetail"."BytesArchived" IS 'Number of bytes written to storage for this record.';

COMMENT ON COLUMN __mj."ArchiveRunDetail"."ErrorMessage" IS 'Error details when Status is Failed.';

COMMENT ON COLUMN __mj."ArchiveRunDetail"."ArchivedAt" IS 'Timestamp when this record was successfully archived.';

COMMENT ON COLUMN __mj."ArchiveRunDetail"."VersionStamp" IS 'The __mj_UpdatedAt timestamp of the record at the time of archiving, used for conflict detection during restore.';

COMMENT ON COLUMN __mj."ArchiveRunDetail"."IsRecordChangeArchive" IS 'When true, this detail row represents an archived Record Change entry rather than a primary entity record.';


-- ===================== Other =====================

-- Migration: Create Archive Tables
-- Description: Introduces the four archive tables for the MemberJunction Archiving Engine:
--   1. ArchiveConfiguration — top-level pipeline config (storage, retention, mode)
--   2. ArchiveConfigurationEntity — per-entity overrides within a configuration
--   3. ArchiveRun — tracks each archive execution
--   4. ArchiveRunDetail — per-record outcome for each run

-- ============================================================================
-- Table 1: ArchiveConfiguration
-- ============================================================================

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Archive Run Details */

/* spUpdate Permissions for MJ: Archive Configurations */

/* spUpdate Permissions for MJ: Archive Configuration Entities */

/* spUpdate Permissions for MJ: Archive Runs */
