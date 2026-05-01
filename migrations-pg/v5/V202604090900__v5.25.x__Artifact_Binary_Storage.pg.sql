
-- ===================== DDL: Tables, PKs, Indexes =====================

-- =============================================================================
-- v5.22.x: Artifact Binary Storage
-- =============================================================================
-- Extends ArtifactVersion to reference binary files stored in MJStorage,
-- enabling agents to produce PDF, Excel, and Word documents as artifacts.
--
-- Changes:
--   ArtifactVersion  - adds FileID (FK → File), ContentMode, MimeType,
--                      FileName, ContentSizeBytes
--   ArtifactType     - adds ContentCategory ('Text' | 'File')
--
-- New ArtifactType seed records: PDF, Excel Spreadsheet, Word Document
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ArtifactVersion — add binary storage columns
-- -----------------------------------------------------------------------------
ALTER TABLE __mj."ArtifactVersion"
 ADD COLUMN "FileID"           UUID NULL
            CONSTRAINT FK_ArtifactVersion_File REFERENCES __mj."File"("ID"),
 ADD COLUMN "ContentMode"      VARCHAR(10)     NOT NULL
            CONSTRAINT DF_ArtifactVersion_ContentMode DEFAULT 'Text'
            CONSTRAINT CK_ArtifactVersion_ContentMode CHECK ("ContentMode" IN ('Text', 'File')),
 ADD COLUMN "MimeType"         VARCHAR(200)    NULL,
 ADD COLUMN "FileName"         VARCHAR(500)    NULL,
 ADD COLUMN "ContentSizeBytes" BIGINT           NULL;


-- -----------------------------------------------------------------------------
-- 2. ArtifactType — add ContentCategory to distinguish text vs file types
-- -----------------------------------------------------------------------------
ALTER TABLE __mj."ArtifactType"
 ADD COLUMN "ContentCategory" VARCHAR(10) NOT NULL
            CONSTRAINT DF_ArtifactType_ContentCategory DEFAULT 'Text'
            CONSTRAINT CK_ArtifactType_ContentCategory CHECK ("ContentCategory" IN ('Text', 'File'));

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArtifactType_ParentID" ON __mj."ArtifactType" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArtifactVersion_ArtifactID" ON __mj."ArtifactVersion" ("ArtifactID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArtifactVersion_UserID" ON __mj."ArtifactVersion" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArtifactVersion_FileID" ON __mj."ArtifactVersion" ("FileID");


-- ===================== Helper Functions (fn*) =====================

CREATE OR REPLACE FUNCTION __mj."fnArtifactTypeParentID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."ArtifactType"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."ArtifactType" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwArtifactTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArtifactTypes"
AS SELECT
    a.*,
    "MJArtifactType_ParentID"."Name" AS "Parent",
    "root_ParentID"."RootID" AS "RootParentID"
FROM
    __mj."ArtifactType" AS a
LEFT OUTER JOIN
    __mj."ArtifactType" AS "MJArtifactType_ParentID"
  ON
    a."ParentID" = "MJArtifactType_ParentID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnArtifactTypeParentID_GetRootID"(a."ID", a."ParentID")) AS "root_ParentID" ON TRUE$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwArtifactVersions';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArtifactVersions"
AS SELECT
    a.*,
    "MJArtifact_ArtifactID"."Name" AS "Artifact",
    "MJUser_UserID"."Name" AS "User",
    "MJFile_FileID"."Name" AS "File"
FROM
    __mj."ArtifactVersion" AS a
INNER JOIN
    __mj."Artifact" AS "MJArtifact_ArtifactID"
  ON
    a."ArtifactID" = "MJArtifact_ArtifactID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    a."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."File" AS "MJFile_FileID"
  ON
    a."FileID" = "MJFile_FileID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateArtifactType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_ContentType VARCHAR(100) DEFAULT NULL,
    IN p_IsEnabled BOOLEAN DEFAULT NULL,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_ExtractRules TEXT DEFAULT NULL,
    IN p_DriverClass VARCHAR(255) DEFAULT NULL,
    IN p_Icon VARCHAR(255) DEFAULT NULL,
    IN p_ContentCategory VARCHAR(10) DEFAULT NULL
)
RETURNS SETOF __mj."vwArtifactTypes" AS
$$
DECLARE
    p_ActualID UUID := COALESCE(p_ID, gen_random_uuid());
BEGIN
INSERT INTO
    __mj."ArtifactType"
        (
            "Name",
                "Description",
                "ContentType",
                "IsEnabled",
                "ParentID",
                "ExtractRules",
                "DriverClass",
                "Icon",
                "ContentCategory",
                "ID"
        )
    VALUES
        (
            p_Name,
                p_Description,
                p_ContentType,
                COALESCE(p_IsEnabled, TRUE),
                p_ParentID,
                p_ExtractRules,
                p_DriverClass,
                p_Icon,
                COALESCE(p_ContentCategory, 'Text'),
                p_ActualID
        );
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwArtifactTypes" WHERE "ID" = p_ActualID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArtifactType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(100),
    IN p_Description TEXT,
    IN p_ContentType VARCHAR(100),
    IN p_IsEnabled BOOLEAN,
    IN p_ParentID UUID,
    IN p_ExtractRules TEXT,
    IN p_DriverClass VARCHAR(255),
    IN p_Icon VARCHAR(255),
    IN p_ContentCategory VARCHAR(10)
)
RETURNS SETOF __mj."vwArtifactTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ArtifactType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ContentType" = p_ContentType,
        "IsEnabled" = p_IsEnabled,
        "ParentID" = p_ParentID,
        "ExtractRules" = p_ExtractRules,
        "DriverClass" = p_DriverClass,
        "Icon" = p_Icon,
        "ContentCategory" = p_ContentCategory
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwArtifactTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwArtifactTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArtifactType"
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

CREATE OR REPLACE FUNCTION __mj."spCreateArtifactVersion"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ArtifactID UUID DEFAULT NULL,
    IN p_VersionNumber INTEGER DEFAULT NULL,
    IN p_Content TEXT DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_ContentHash VARCHAR(500) DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_FileID UUID DEFAULT NULL,
    IN p_ContentMode VARCHAR(10) DEFAULT NULL,
    IN p_MimeType VARCHAR(200) DEFAULT NULL,
    IN p_FileName VARCHAR(500) DEFAULT NULL,
    IN p_ContentSizeBytes BIGINT DEFAULT NULL
)
RETURNS SETOF __mj."vwArtifactVersions" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ArtifactVersion"
            (
                "ID",
                "ArtifactID",
                "VersionNumber",
                "Content",
                "Configuration",
                "Comments",
                "UserID",
                "ContentHash",
                "Name",
                "Description",
                "FileID",
                "ContentMode",
                "MimeType",
                "FileName",
                "ContentSizeBytes"
            )
        VALUES
            (
                p_ID,
                p_ArtifactID,
                p_VersionNumber,
                p_Content,
                p_Configuration,
                p_Comments,
                p_UserID,
                p_ContentHash,
                p_Name,
                p_Description,
                p_FileID,
                COALESCE(p_ContentMode, 'Text'),
                p_MimeType,
                p_FileName,
                p_ContentSizeBytes
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ArtifactVersion"
            (
                "ArtifactID",
                "VersionNumber",
                "Content",
                "Configuration",
                "Comments",
                "UserID",
                "ContentHash",
                "Name",
                "Description",
                "FileID",
                "ContentMode",
                "MimeType",
                "FileName",
                "ContentSizeBytes"
            )
        VALUES
            (
                p_ArtifactID,
                p_VersionNumber,
                p_Content,
                p_Configuration,
                p_Comments,
                p_UserID,
                p_ContentHash,
                p_Name,
                p_Description,
                p_FileID,
                COALESCE(p_ContentMode, 'Text'),
                p_MimeType,
                p_FileName,
                p_ContentSizeBytes
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwArtifactVersions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArtifactVersion"(
    IN p_ID UUID,
    IN p_ArtifactID UUID,
    IN p_VersionNumber INTEGER,
    IN p_Content TEXT,
    IN p_Configuration TEXT,
    IN p_Comments TEXT,
    IN p_UserID UUID,
    IN p_ContentHash VARCHAR(500),
    IN p_Name VARCHAR(255),
    IN p_Description TEXT,
    IN p_FileID UUID,
    IN p_ContentMode VARCHAR(10),
    IN p_MimeType VARCHAR(200),
    IN p_FileName VARCHAR(500),
    IN p_ContentSizeBytes BIGINT
)
RETURNS SETOF __mj."vwArtifactVersions" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ArtifactVersion"
    SET
        "ArtifactID" = p_ArtifactID,
        "VersionNumber" = p_VersionNumber,
        "Content" = p_Content,
        "Configuration" = p_Configuration,
        "Comments" = p_Comments,
        "UserID" = p_UserID,
        "ContentHash" = p_ContentHash,
        "Name" = p_Name,
        "Description" = p_Description,
        "FileID" = p_FileID,
        "ContentMode" = p_ContentMode,
        "MimeType" = p_MimeType,
        "FileName" = p_FileName,
        "ContentSizeBytes" = p_ContentSizeBytes
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwArtifactVersions" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwArtifactVersions" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactVersion"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArtifactVersion"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateArtifactType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateArtifactType" ON __mj."ArtifactType";
CREATE TRIGGER "trgUpdateArtifactType"
    BEFORE UPDATE ON __mj."ArtifactType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateArtifactType_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateArtifactVersion_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateArtifactVersion" ON __mj."ArtifactVersion";
CREATE TRIGGER "trgUpdateArtifactVersion"
    BEFORE UPDATE ON __mj."ArtifactVersion"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateArtifactVersion_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2492de21-a1e2-497b-9b47-96cc61a08164' OR ("EntityID" = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND "Name" = 'ContentCategory')
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
        '2492de21-a1e2-497b-9b47-96cc61a08164',
        '91797885-7128-4B71-8C4B-81C5FEE24F38', -- "Entity": "MJ": "Artifact" "Types"
        100026,
        'ContentCategory',
        'Content Category',
        'Classifies whether this artifact type stores text content (''Text'', the default for all existing types) or a binary file in MJStorage (''File''). Used by AgentRunner and viewer components to route file-based artifacts correctly.',
        'TEXT',
        20,
        0,
        0,
        FALSE,
        'Text',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fb6cf4f1-a470-46ee-95dd-2c899f8fc51b' OR ("EntityID" = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND "Name" = 'FileID')
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
        'fb6cf4f1-a470-46ee-95dd-2c899f8fc51b',
        'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- "Entity": "MJ": "Artifact" "Versions"
        100032,
        'FileID',
        'File ID',
        'Foreign key to the MJ: Files entity. When ContentMode is ''File'', this references the binary file stored in MJStorage. NULL when ContentMode is ''Text''.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '29248F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1811bc2e-c1ea-4f7f-9aad-892a909e2109' OR ("EntityID" = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND "Name" = 'ContentMode')
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
        '1811bc2e-c1ea-4f7f-9aad-892a909e2109',
        'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- "Entity": "MJ": "Artifact" "Versions"
        100033,
        'ContentMode',
        'Content Mode',
        'Determines how artifact content is stored. ''Text'' (default) means the Content column holds the data. ''File'' means FileID references a binary file in MJStorage and Content is unused.',
        'TEXT',
        20,
        0,
        0,
        FALSE,
        'Text',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b50b55af-0282-4103-a9ac-8301fabb49c7' OR ("EntityID" = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND "Name" = 'MimeType')
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
        'b50b55af-0282-4103-a9ac-8301fabb49c7',
        'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- "Entity": "MJ": "Artifact" "Versions"
        100034,
        'MimeType',
        'Mime Type',
        'MIME type of the stored file (e.g. application/pdf). Denormalized from the File entity for display without joins. Only populated when ContentMode is ''File''.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2eff50c2-4c28-4c80-a058-af6fd51fad47' OR ("EntityID" = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND "Name" = 'FileName')
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
        '2eff50c2-4c28-4c80-a058-af6fd51fad47',
        'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- "Entity": "MJ": "Artifact" "Versions"
        100035,
        'FileName',
        'File Name',
        'Original filename of the stored file (e.g. report.pdf). Denormalized from the File entity for display without joins. Only populated when ContentMode is ''File''.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8647eee6-0d7f-4f86-ad4d-458a53e11eb9' OR ("EntityID" = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND "Name" = 'ContentSizeBytes')
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
        '8647eee6-0d7f-4f86-ad4d-458a53e11eb9',
        'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- "Entity": "MJ": "Artifact" "Versions"
        100036,
        'ContentSizeBytes',
        'Content Size Bytes',
        'Size of the stored file in bytes. Denormalized for display without loading the file. Only populated when ContentMode is ''File''.',
        'bigint',
        8,
        19,
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('b33269a0-9fd5-450d-83c6-e79a4f62c954', '1811BC2E-C1EA-4F7F-9AAD-892A909E2109', 1, 'File', 'File', NOW(), NOW());
/* SQL text to insert entity field value with ID 2a421fd2-b940-4b9f-bb7f-61f6d773627c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('2a421fd2-b940-4b9f-bb7f-61f6d773627c', '1811BC2E-C1EA-4F7F-9AAD-892A909E2109', 2, 'Text', 'Text', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 1811BC2E-C1EA-4F7F-9AAD-892A909E2109 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='1811BC2E-C1EA-4F7F-9AAD-892A909E2109';
/* SQL text to insert entity field value with ID 6b60bee1-22c4-4d1a-a500-5bc886989969 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('6b60bee1-22c4-4d1a-a500-5bc886989969', '2492DE21-A1E2-497B-9B47-96CC61A08164', 1, 'File', 'File', NOW(), NOW());
/* SQL text to insert entity field value with ID 1f30864d-94c5-4e04-b0b4-b7d35af70c79 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('1f30864d-94c5-4e04-b0b4-b7d35af70c79', '2492DE21-A1E2-497B-9B47-96CC61A08164', 2, 'Text', 'Text', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 2492DE21-A1E2-497B-9B47-96CC61A08164 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='2492DE21-A1E2-497B-9B47-96CC61A08164';
/* Create Entity Relationship: MJ: Files -> MJ: Artifact Versions (One To Many via FileID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '16657ed1-91ca-48b4-a532-1164d6cf8c39'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('16657ed1-91ca-48b4-a532-1164d6cf8c39', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', 'FileID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd4e062fc-5555-4b7c-82a6-87a6e46747cd' OR ("EntityID" = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND "Name" = 'File')
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
        'd4e062fc-5555-4b7c-82a6-87a6e46747cd',
        'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- "Entity": "MJ": "Artifact" "Versions"
        100039,
        'File',
        'File',
        NULL,
        'TEXT',
        1000,
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
               WHERE "ID" = '2492DE21-A1E2-497B-9B47-96CC61A08164'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '874E9B47-A201-4C78-896A-D41A607B1840'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'B7B428EF-DE10-4882-8517-28636332C6DB'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '2492DE21-A1E2-497B-9B47-96CC61A08164'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '2EFF50C2-4C28-4C80-A058-AF6FD51FAD47'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '96E57B30-5EFD-4612-A28E-16AB359864EA'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '2EFF50C2-4C28-4C80-A058-AF6FD51FAD47'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'E1A69905-07E6-4852-AA41-9D4E610B0AAE'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '315DF2ED-FC5C-4337-B346-FC91AFE461CC'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 20 fields */
-- UPDATE Entity Field Category Info MJ: Artifact Versions."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6B6BFB96-D6C3-4254-B9F5-28B306AD48DD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."ArtifactID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Artifact',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E986C32B-9789-46B1-88ED-A1684050E6AB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."VersionNumber"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9C2B8B64-F592-4BFD-8ED4-E0488C042A5D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C8DA4933-F812-48B2-A445-E49413076B6B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '96E57B30-5EFD-4612-A28E-16AB359864EA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."Content"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A5D391B2-7945-448E-980A-93C5A2549A65' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."Configuration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A3BDF038-3DA1-4088-A57F-9656C95CFAA8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."Comments"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A2524C0A-5778-4D42-B468-8E6026ECC3BB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."ContentHash"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '02F91602-349C-4F60-B9C4-356BBC029C59' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."UserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '84FA642F-F570-4B31-978B-32E786CA429A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."Artifact"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E1A69905-07E6-4852-AA41-9D4E610B0AAE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."User"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '315DF2ED-FC5C-4337-B346-FC91AFE461CC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9C004E0E-12A3-47EB-9E7A-6A306E1868D4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F378B93-C2A0-47A2-AF7A-7E77C5461E6F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."FileID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'File Storage',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'File',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FB6CF4F1-A470-46EE-95DD-2C899F8FC51B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."ContentMode"

UPDATE __mj."EntityField"
SET 
   "Category" = 'File Storage',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1811BC2E-C1EA-4F7F-9AAD-892A909E2109' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."MimeType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'File Storage',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'MIME Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B50B55AF-0282-4103-A9AC-8301FABB49C7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."FileName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'File Storage',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2EFF50C2-4C28-4C80-A058-AF6FD51FAD47' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."ContentSizeBytes"

UPDATE __mj."EntityField"
SET 
   "Category" = 'File Storage',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8647EEE6-0D7F-4F86-AD4D-458A53E11EB9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Versions."File"

UPDATE __mj."EntityField"
SET 
   "Category" = 'File Storage',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D4E062FC-5555-4B7C-82A6-87A6E46747CD' AND "AutoUpdateCategory" = TRUE;
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('0bb76306-31b2-46a8-83e6-f30654f4dfe8', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', 'FieldCategoryInfo', '{"File Storage":{"icon":"fa fa-file","description":"Details about the stored file version when content is kept as a binary attachment"}}', NOW(), NOW());
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"File Storage":"fa fa-file"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND "Name" = 'FieldCategoryIcons';
/* Set categories for 14 fields */
-- UPDATE Entity Field Category Info MJ: Artifact Types."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E3C8A690-7E75-499E-B603-3F900AB94704' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '79A9CC18-2F29-4D9C-93CB-82D9ED497B05' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '874E9B47-A201-4C78-896A-D41A607B1840' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."ContentType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B7B428EF-DE10-4882-8517-28636332C6DB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."IsEnabled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A0B16E34-7C24-4811-84E6-75CCA5C499FB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."DriverClass"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2FEDE9AF-F0FE-438C-A369-93AC24A882C1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."Icon"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '011BB58C-1187-4107-A82E-D8C676A2A983' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."ContentCategory"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Artifact Type Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2492DE21-A1E2-497B-9B47-96CC61A08164' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A8CC25C6-C9DE-4726-9BA5-81E0C4749281' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6AE8938F-5656-4CC8-89BC-1CCAAC9DF213' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."ParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '02B6383F-BAE6-465C-BBB4-652E6F75A74C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."ExtractRules"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6CACE3BF-BDF2-4443-9D2C-E28E4FE4E489' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."Parent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '63D25BCF-550E-4013-AB1F-03657369B0E9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."RootParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C369578-B099-4E25-98B5-8218CE90A432' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwArtifactTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Permissions for vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArtifactTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spCreateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArtifactType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Artifact Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArtifactType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spUpdateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArtifactType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArtifactType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spDeleteArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Artifact Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: vwArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Versions
-----               SCHEMA:      __mj
-----               BASE TABLE:  ArtifactVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArtifactVersions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: Permissions for vwArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArtifactVersions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spCreateArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArtifactVersion" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Artifact Versions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArtifactVersion" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spUpdateArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArtifactVersion" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArtifactVersion" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spDeleteArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactVersion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Artifact Versions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactVersion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."ArtifactVersion"."FileID" IS 'Foreign key to the MJ: Files entity. When ContentMode is ';

COMMENT ON COLUMN __mj."ArtifactVersion"."ContentMode" IS 'Determines how artifact content is stored. ';

COMMENT ON COLUMN __mj."ArtifactVersion"."MimeType" IS 'MIME type of the stored file (e.g. application/pdf). Denormalized from the File entity for display without joins. Only populated when ContentMode is ';

COMMENT ON COLUMN __mj."ArtifactVersion"."FileName" IS 'Original filename of the stored file (e.g. report.pdf). Denormalized from the File entity for display without joins. Only populated when ContentMode is ';

COMMENT ON COLUMN __mj."ArtifactVersion"."ContentSizeBytes" IS 'Size of the stored file in bytes. Denormalized for display without loading the file. Only populated when ContentMode is ';

COMMENT ON COLUMN __mj."ArtifactType"."ContentCategory" IS 'Classifies whether this artifact type stores text content (';


-- ===================== Other =====================

-- -----------------------------------------------------------------------------
-- 3. ArtifactType seed data (PDF, Excel, Word) moved to metadata JSON:
--    /metadata/artifact-types/.artifact-types.json
--    Push via: npx mj sync push --dir=metadata --include="artifact-types"
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 4. Column descriptions
-- -----------------------------------------------------------------------------

/* spUpdate Permissions for MJ: Artifact Types */

/* spUpdate Permissions for MJ: Artifact Versions */
