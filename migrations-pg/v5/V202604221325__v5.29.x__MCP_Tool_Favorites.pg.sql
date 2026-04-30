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

-- PR #2209 Part 3.6: MCP Tool Favorites
-- Per-user star/favorite tracking for MCP Server Tools. Drives the "Favorites only"
-- quick filter in the MCP Dashboard and the Favorite/Recent prepend on the searchable
-- Test Tool dialog picker.

CREATE TABLE __mj."MCPToolFavorite" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "UserID" UUID NOT NULL,
 "MCPServerToolID" UUID NOT NULL,
 CONSTRAINT PK_MCPToolFavorite PRIMARY KEY ("ID"),
 CONSTRAINT FK_MCPToolFavorite_User
 FOREIGN KEY ("UserID") REFERENCES __mj."User"("ID"),
 CONSTRAINT FK_MCPToolFavorite_MCPServerTool
 FOREIGN KEY ("MCPServerToolID") REFERENCES __mj."MCPServerTool"("ID"),
 CONSTRAINT UQ_MCPToolFavorite_User_Tool UNIQUE ("UserID", "MCPServerToolID")
);

ALTER TABLE __mj."MCPToolFavorite"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."MCPToolFavorite" */
ALTER TABLE __mj."MCPToolFavorite"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MCPToolFavorite_UserID" ON __mj."MCPToolFavorite" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MCPToolFavorite_MCPServerToolID" ON __mj."MCPToolFavorite" ("MCPServerToolID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwMCPToolFavorites';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMCPToolFavorites"
AS SELECT
    m.*,
    "MJUser_UserID"."Name" AS "User",
    "MJMCPServerTool_MCPServerToolID"."ToolTitle" AS "MCPServerTool"
FROM
    __mj."MCPToolFavorite" AS m
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    m."UserID" = "MJUser_UserID"."ID"
INNER JOIN
    __mj."MCPServerTool" AS "MJMCPServerTool_MCPServerToolID"
  ON
    m."MCPServerToolID" = "MJMCPServerTool_MCPServerToolID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateMCPToolFavorite"(
    IN p_ID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_MCPServerToolID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwMCPToolFavorites" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."MCPToolFavorite"
            (
                "ID",
                "UserID",
                "MCPServerToolID"
            )
        VALUES
            (
                p_ID,
                p_UserID,
                p_MCPServerToolID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."MCPToolFavorite"
            (
                "UserID",
                "MCPServerToolID"
            )
        VALUES
            (
                p_UserID,
                p_MCPServerToolID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwMCPToolFavorites" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateMCPToolFavorite"(
    IN p_ID UUID,
    IN p_UserID UUID,
    IN p_MCPServerToolID UUID
)
RETURNS SETOF __mj."vwMCPToolFavorites" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."MCPToolFavorite"
    SET
        "UserID" = p_UserID,
        "MCPServerToolID" = p_MCPServerToolID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwMCPToolFavorites" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwMCPToolFavorites" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteMCPToolFavorite"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."MCPToolFavorite"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateMCPToolFavorite_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateMCPToolFavorite" ON __mj."MCPToolFavorite";
CREATE TRIGGER "trgUpdateMCPToolFavorite"
    BEFORE UPDATE ON __mj."MCPToolFavorite"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateMCPToolFavorite_func"();


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
         '3fe3016c-1e34-4510-9a68-7b1664f58217',
         'MJ: MCP Tool Favorites',
         'MCP Tool Favorites',
         'Per-user favorite marker for an MCP Server Tool. Each row indicates the user has starred the referenced tool for quick access in the MCP Dashboard Tools tab and in the Test Tool dialog picker. Combined with UserID forms a unique pair so a user cannot favorite the same tool twice.',
         NULL,
         'MCPToolFavorite',
         'vwMCPToolFavorites',
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
/* SQL generated to add new entity MJ: MCP Tool Favorites to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3fe3016c-1e34-4510-9a68-7b1664f58217', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: MCP Tool Favorites for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3fe3016c-1e34-4510-9a68-7b1664f58217', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: MCP Tool Favorites for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3fe3016c-1e34-4510-9a68-7b1664f58217', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: MCP Tool Favorites for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3fe3016c-1e34-4510-9a68-7b1664f58217', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."MCPToolFavorite" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."MCPToolFavorite" */
UPDATE __mj."MCPToolFavorite" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."MCPToolFavorite" */
ALTER TABLE __mj."MCPToolFavorite" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MCPToolFavorite"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."MCPToolFavorite" */
UPDATE __mj."MCPToolFavorite" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."MCPToolFavorite" */
ALTER TABLE __mj."MCPToolFavorite" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MCPToolFavorite"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ee48e505-794c-48c8-a8fc-6ec31794fd7b' OR ("EntityID" = '3FE3016C-1E34-4510-9A68-7B1664F58217' AND "Name" = 'ID')
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
        'ee48e505-794c-48c8-a8fc-6ec31794fd7b',
        '3FE3016C-1E34-4510-9A68-7B1664F58217', -- "Entity": "MJ": "MCP" "Tool" "Favorites"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '969ab93c-41af-4ba8-8a3a-682286e8f7b5' OR ("EntityID" = '3FE3016C-1E34-4510-9A68-7B1664F58217' AND "Name" = 'UserID')
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
        '969ab93c-41af-4ba8-8a3a-682286e8f7b5',
        '3FE3016C-1E34-4510-9A68-7B1664F58217', -- "Entity": "MJ": "MCP" "Tool" "Favorites"
        100002,
        'UserID',
        'User ID',
        'The user who starred this tool. Favorites are per-user; multiple users can favorite the same tool independently. References the MJ User table.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1687507-aeff-424e-8e03-6135528a1fed' OR ("EntityID" = '3FE3016C-1E34-4510-9A68-7B1664F58217' AND "Name" = 'MCPServerToolID')
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
        'f1687507-aeff-424e-8e03-6135528a1fed',
        '3FE3016C-1E34-4510-9A68-7B1664F58217', -- "Entity": "MJ": "MCP" "Tool" "Favorites"
        100003,
        'MCPServerToolID',
        'MCP Server Tool ID',
        'The MCP Server Tool that has been favorited. Combined with UserID this forms a unique constraint so a user cannot favorite the same tool twice.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c9583cf3-453b-4378-aabb-3e3ae1e9717b' OR ("EntityID" = '3FE3016C-1E34-4510-9A68-7B1664F58217' AND "Name" = '__mj_CreatedAt')
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
        'c9583cf3-453b-4378-aabb-3e3ae1e9717b',
        '3FE3016C-1E34-4510-9A68-7B1664F58217', -- "Entity": "MJ": "MCP" "Tool" "Favorites"
        100004,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cf0ab335-c73e-40f9-8709-3cdcd43e7ff3' OR ("EntityID" = '3FE3016C-1E34-4510-9A68-7B1664F58217' AND "Name" = '__mj_UpdatedAt')
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
        'cf0ab335-c73e-40f9-8709-3cdcd43e7ff3',
        '3FE3016C-1E34-4510-9A68-7B1664F58217', -- "Entity": "MJ": "MCP" "Tool" "Favorites"
        100005,
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
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7c449931-da64-438c-944b-72042e7da3de'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('7c449931-da64-438c-944b-72042e7da3de', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '3FE3016C-1E34-4510-9A68-7B1664F58217', 'UserID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '07619957-d9d6-4355-9bb2-607020be47de'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('07619957-d9d6-4355-9bb2-607020be47de', '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', '3FE3016C-1E34-4510-9A68-7B1664F58217', 'MCPServerToolID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '92729d70-c7c8-4714-9ba9-4f78341982c2' OR ("EntityID" = '3FE3016C-1E34-4510-9A68-7B1664F58217' AND "Name" = 'User')
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
        '92729d70-c7c8-4714-9ba9-4f78341982c2',
        '3FE3016C-1E34-4510-9A68-7B1664F58217', -- "Entity": "MJ": "MCP" "Tool" "Favorites"
        100011,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bdac7cf2-574e-4fc4-8d36-aff8ffa5a867' OR ("EntityID" = '3FE3016C-1E34-4510-9A68-7B1664F58217' AND "Name" = 'MCPServerTool')
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
        'bdac7cf2-574e-4fc4-8d36-aff8ffa5a867',
        '3FE3016C-1E34-4510-9A68-7B1664F58217', -- "Entity": "MJ": "MCP" "Tool" "Favorites"
        100012,
        'MCPServerTool',
        'MCP Server Tool',
        NULL,
        'TEXT',
        510,
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
               SET "IsNameField" = TRUE
               WHERE "ID" = 'BDAC7CF2-574E-4FC4-8D36-AFF8FFA5A867'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C9583CF3-453B-4378-AABB-3E3AE1E9717B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '92729D70-C7C8-4714-9BA9-4F78341982C2'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'BDAC7CF2-574E-4FC4-8D36-AFF8FFA5A867'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'BDAC7CF2-574E-4FC4-8D36-AFF8FFA5A867'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 7 fields */
-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EE48E505-794C-48C8-A8FC-6EC31794FD7B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites."UserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Favorite Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '969AB93C-41AF-4BA8-8A3A-682286E8F7B5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites."MCPServerToolID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Favorite Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'MCP Server Tool',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F1687507-AEFF-424E-8E03-6135528A1FED' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites."User"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Favorite Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '92729D70-C7C8-4714-9BA9-4F78341982C2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites."MCPServerTool"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Favorite Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tool Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BDAC7CF2-574E-4FC4-8D36-AFF8FFA5A867' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C9583CF3-453B-4378-AABB-3E3AE1E9717B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CF0AB335-C73E-40F9-8709-3CDCD43E7FF3' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-star */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-star', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '3FE3016C-1E34-4510-9A68-7B1664F58217';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('5d5229e1-da54-49b0-af10-a4d08ff9dd6e', '3FE3016C-1E34-4510-9A68-7B1664F58217', 'FieldCategoryInfo', '{"Favorite Configuration":{"icon":"fa fa-star","description":"Details identifying the user and the specific tool they have favorited"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('1fd029a8-8b85-4f1a-9477-3f74a2c31e29', '3FE3016C-1E34-4510-9A68-7B1664F58217', 'FieldCategoryIcons', '{"Favorite Configuration":"fa fa-star","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: junction, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '3FE3016C-1E34-4510-9A68-7B1664F58217';


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwMCPToolFavorites" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: MCP Tool Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Favorites
-- Item: Permissions for vwMCPToolFavorites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwMCPToolFavorites" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: MCP Tool Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Favorites
-- Item: spCreateMCPToolFavorite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MCPToolFavorite
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateMCPToolFavorite" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: MCP Tool Favorites */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateMCPToolFavorite" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: MCP Tool Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Favorites
-- Item: spUpdateMCPToolFavorite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MCPToolFavorite
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateMCPToolFavorite" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateMCPToolFavorite" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: MCP Tool Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Favorites
-- Item: spDeleteMCPToolFavorite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPToolFavorite
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPToolFavorite" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: MCP Tool Favorites */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPToolFavorite" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON TABLE __mj."MCPToolFavorite" IS 'Per-user favorite marker for an MCP Server Tool. Each row indicates the user has starred the referenced tool for quick access in the MCP Dashboard Tools tab and in the Test Tool dialog picker. Combined with UserID forms a unique pair so a user cannot favorite the same tool twice.';

COMMENT ON COLUMN __mj."MCPToolFavorite"."UserID" IS 'The user who starred this tool. Favorites are per-user; multiple users can favorite the same tool independently. References the MJ User table.';

COMMENT ON COLUMN __mj."MCPToolFavorite"."MCPServerToolID" IS 'The MCP Server Tool that has been favorited. Combined with UserID this forms a unique constraint so a user cannot favorite the same tool twice.';


-- ===================== Other =====================

-- ==============================================================================
-- CodeGen output for MJ: MCP Tool Favorites
-- Entity registration, EntityField rows, role permissions, SP / view / indexes.
-- Generated by running the first `npx mj codegen` after this DDL applies, then
-- appending the MCPToolFavorite slice of CodeGen_Run_*.sql back into this file
-- so the migration is self-contained on future reset-and-rebuilds.
-- (Appended block follows.)
-- ==============================================================================
/* SQL generated to create new entity MJ: MCP Tool Favorites */

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: MCP Tool Favorites */
