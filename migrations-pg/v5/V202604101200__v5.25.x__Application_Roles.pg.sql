
-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE TABLE __mj."ApplicationRole" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ApplicationID" UUID NOT NULL,
 "RoleID" UUID NOT NULL,
 "CanAccess" BOOLEAN NOT NULL DEFAULT TRUE,
 "CanAdmin" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT PK_ApplicationRole PRIMARY KEY ("ID"),
 CONSTRAINT FK_ApplicationRole_Application
 FOREIGN KEY ("ApplicationID") REFERENCES __mj."Application"("ID"),
 CONSTRAINT FK_ApplicationRole_Role
 FOREIGN KEY ("RoleID") REFERENCES __mj."Role"("ID"),
 CONSTRAINT UQ_ApplicationRole_App_Role
 UNIQUE ("ApplicationID", "RoleID")
);

-- Extended properties for CodeGen;

ALTER TABLE __mj."ApplicationRole"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ApplicationRole" */

ALTER TABLE __mj."ApplicationRole" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ApplicationRole" */

ALTER TABLE __mj."ApplicationRole"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ApplicationRole" */

ALTER TABLE __mj."ApplicationRole" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to insert new entity field */

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ApplicationRole_ApplicationID" ON __mj."ApplicationRole" ("ApplicationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ApplicationRole_RoleID" ON __mj."ApplicationRole" ("RoleID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwApplicationRoles';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwApplicationRoles"
AS SELECT
    a.*,
    "MJApplication_ApplicationID"."Name" AS "Application",
    "MJRole_RoleID"."Name" AS "Role"
FROM
    __mj."ApplicationRole" AS a
INNER JOIN
    __mj."Application" AS "MJApplication_ApplicationID"
  ON
    a."ApplicationID" = "MJApplication_ApplicationID"."ID"
INNER JOIN
    __mj."Role" AS "MJRole_RoleID"
  ON
    a."RoleID" = "MJRole_RoleID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateApplicationRole"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ApplicationID UUID DEFAULT NULL,
    IN p_RoleID UUID DEFAULT NULL,
    IN p_CanAccess BOOLEAN DEFAULT NULL,
    IN p_CanAdmin BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwApplicationRoles" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ApplicationRole"
            (
                "ID",
                "ApplicationID",
                "RoleID",
                "CanAccess",
                "CanAdmin"
            )
        VALUES
            (
                p_ID,
                p_ApplicationID,
                p_RoleID,
                COALESCE(p_CanAccess, TRUE),
                COALESCE(p_CanAdmin, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ApplicationRole"
            (
                "ApplicationID",
                "RoleID",
                "CanAccess",
                "CanAdmin"
            )
        VALUES
            (
                p_ApplicationID,
                p_RoleID,
                COALESCE(p_CanAccess, TRUE),
                COALESCE(p_CanAdmin, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwApplicationRoles" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateApplicationRole"(
    IN p_ID UUID,
    IN p_ApplicationID UUID,
    IN p_RoleID UUID,
    IN p_CanAccess BOOLEAN,
    IN p_CanAdmin BOOLEAN
)
RETURNS SETOF __mj."vwApplicationRoles" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ApplicationRole"
    SET
        "ApplicationID" = p_ApplicationID,
        "RoleID" = p_RoleID,
        "CanAccess" = p_CanAccess,
        "CanAdmin" = p_CanAdmin
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwApplicationRoles" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwApplicationRoles" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteApplicationRole"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ApplicationRole"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateApplicationRole_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateApplicationRole" ON __mj."ApplicationRole";
CREATE TRIGGER "trgUpdateApplicationRole"
    BEFORE UPDATE ON __mj."ApplicationRole"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateApplicationRole_func"();


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
         '6d3d08a7-12f2-42ea-bd15-128fbe4a4259',
         'MJ: Application Roles',
         'Application Roles',
         'Controls which roles can access and administer specific applications. When no ApplicationRole records exist for an application, all roles can access it (open access). When at least one record exists, only roles with CanAccess=1 are permitted.',
         NULL,
         'ApplicationRole',
         'vwApplicationRoles',
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
/* SQL generated to add new entity MJ: Application Roles to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '6d3d08a7-12f2-42ea-bd15-128fbe4a4259', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Application Roles for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('6d3d08a7-12f2-42ea-bd15-128fbe4a4259', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Application Roles for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('6d3d08a7-12f2-42ea-bd15-128fbe4a4259', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Application Roles for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('6d3d08a7-12f2-42ea-bd15-128fbe4a4259', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."ApplicationRole" */

UPDATE __mj."ApplicationRole" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."ApplicationRole" */

ALTER TABLE __mj."ApplicationRole" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ApplicationRole" */

UPDATE __mj."ApplicationRole" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ApplicationRole" */

ALTER TABLE __mj."ApplicationRole" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ApplicationRole" */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'da036f52-2ade-46a5-8f59-b0dc5b585604' OR ("EntityID" = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND "Name" = 'ID')
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
        'da036f52-2ade-46a5-8f59-b0dc5b585604',
        '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- "Entity": "MJ": "Application" "Roles"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ff3a1a6b-fe9a-4cab-91df-5b31b7163b24' OR ("EntityID" = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND "Name" = 'ApplicationID')
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
        'ff3a1a6b-fe9a-4cab-91df-5b31b7163b24',
        '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- "Entity": "MJ": "Application" "Roles"
        100002,
        'ApplicationID',
        'Application ID',
        'Foreign key to the Application this role grant applies to',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'E8238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '11aebe82-d291-41ba-8d4a-b82269d19a47' OR ("EntityID" = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND "Name" = 'RoleID')
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
        '11aebe82-d291-41ba-8d4a-b82269d19a47',
        '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- "Entity": "MJ": "Application" "Roles"
        100003,
        'RoleID',
        'Role ID',
        'Foreign key to the Role being granted or denied access',
        'UUID',
        16,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e76a4f1e-353a-4b03-afbd-c01d89cd6826' OR ("EntityID" = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND "Name" = 'CanAccess')
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
        'e76a4f1e-353a-4b03-afbd-c01d89cd6826',
        '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- "Entity": "MJ": "Application" "Roles"
        100004,
        'CanAccess',
        'Can Access',
        'When true, users in this role can access the application. When false, this record acts as an explicit deny for the role.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c85af0d2-0087-4b0b-9b42-4cea052151cd' OR ("EntityID" = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND "Name" = 'CanAdmin')
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
        'c85af0d2-0087-4b0b-9b42-4cea052151cd',
        '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- "Entity": "MJ": "Application" "Roles"
        100005,
        'CanAdmin',
        'Can Admin',
        'When true, users in this role can modify application settings, manage nav items, and configure the application.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8ed625b3-c9a0-4fe5-bf9b-0a3b2ba878df' OR ("EntityID" = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND "Name" = '__mj_CreatedAt')
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
        '8ed625b3-c9a0-4fe5-bf9b-0a3b2ba878df',
        '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- "Entity": "MJ": "Application" "Roles"
        100006,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0ddb6e26-63b2-493a-8a06-a5cd09e0fe7b' OR ("EntityID" = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND "Name" = '__mj_UpdatedAt')
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
        '0ddb6e26-63b2-493a-8a06-a5cd09e0fe7b',
        '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- "Entity": "MJ": "Application" "Roles"
        100007,
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
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f8e3068c-b7ff-4d1a-89f3-e261945fd0b4'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f8e3068c-b7ff-4d1a-89f3-e261945fd0b4', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', 'RoleID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f30a95e9-87af-41f7-ad0f-c92f167e43e7'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f30a95e9-87af-41f7-ad0f-c92f167e43e7', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', 'ApplicationID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8fde076-8709-484a-beb7-6f8e104f9c52' OR ("EntityID" = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND "Name" = 'Application')
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
        'd8fde076-8709-484a-beb7-6f8e104f9c52',
        '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- "Entity": "MJ": "Application" "Roles"
        100015,
        'Application',
        'Application',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6fd232d0-501b-4b50-9161-220f43381de9' OR ("EntityID" = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259' AND "Name" = 'Role')
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
        '6fd232d0-501b-4b50-9161-220f43381de9',
        '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', -- "Entity": "MJ": "Application" "Roles"
        100016,
        'Role',
        'Role',
        NULL,
        'TEXT',
        100,
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
               WHERE "ID" = 'E76A4F1E-353A-4B03-AFBD-C01D89CD6826'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C85AF0D2-0087-4B0B-9B42-4CEA052151CD'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D8FDE076-8709-484A-BEB7-6F8E104F9C52'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '6FD232D0-501B-4B50-9161-220F43381DE9'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'D8FDE076-8709-484A-BEB7-6F8E104F9C52'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '6FD232D0-501B-4B50-9161-220F43381DE9'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 9 fields */
-- UPDATE Entity Field Category Info MJ: Application Roles."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DA036F52-2ADE-46A5-8F59-B0DC5B585604' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Application Roles."ApplicationID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Role Assignment',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Application',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FF3A1A6B-FE9A-4CAB-91DF-5B31B7163B24' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Application Roles."Application"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Role Assignment',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Application Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8FDE076-8709-484A-BEB7-6F8E104F9C52' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Application Roles."RoleID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Role Assignment',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Role',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '11AEBE82-D291-41BA-8D4A-B82269D19A47' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Application Roles."Role"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Role Assignment',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Role Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6FD232D0-501B-4B50-9161-220F43381DE9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Application Roles."CanAccess"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Access Permissions',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E76A4F1E-353A-4B03-AFBD-C01D89CD6826' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Application Roles."CanAdmin"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Access Permissions',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C85AF0D2-0087-4B0B-9B42-4CEA052151CD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Application Roles.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8ED625B3-C9A0-4FE5-BF9B-0A3B2BA878DF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Application Roles.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0DDB6E26-63B2-493A-8A06-A5CD09E0FE7B' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-shield-alt */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-shield-alt', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('10ceddf0-68df-435b-ae79-5012ec42ec0a', '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', 'FieldCategoryInfo', '{"Role Assignment":{"icon":"fa fa-link","description":"The specific application and role association being configured"},"Access Permissions":{"icon":"fa fa-user-lock","description":"Specific access and administrative rights granted to the role for this application"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('ae7824ff-ad5b-4b5a-9023-51e90c0cb0d0', '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', 'FieldCategoryIcons', '{"Role Assignment":"fa fa-link","Access Permissions":"fa fa-user-lock","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: junction, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '6D3D08A7-12F2-42EA-BD15-128FBE4A4259';


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwApplicationRoles" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Application Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Roles
-- Item: Permissions for vwApplicationRoles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwApplicationRoles" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Application Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Roles
-- Item: spCreateApplicationRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ApplicationRole
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateApplicationRole" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Application Roles */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateApplicationRole" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Application Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Roles
-- Item: spUpdateApplicationRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ApplicationRole
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateApplicationRole" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateApplicationRole" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Application Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Roles
-- Item: spDeleteApplicationRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ApplicationRole
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationRole" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Application Roles */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationRole" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON TABLE __mj."ApplicationRole" IS 'Controls which roles can access and administer specific applications. When no ApplicationRole records exist for an application, all roles can access it (open access). When at least one record exists, only roles with CanAccess=1 are permitted.';

COMMENT ON COLUMN __mj."ApplicationRole"."ApplicationID" IS 'Foreign key to the Application this role grant applies to';

COMMENT ON COLUMN __mj."ApplicationRole"."RoleID" IS 'Foreign key to the Role being granted or denied access';

COMMENT ON COLUMN __mj."ApplicationRole"."CanAccess" IS 'When true, users in this role can access the application. When false, this record acts as an explicit deny for the role.';

COMMENT ON COLUMN __mj."ApplicationRole"."CanAdmin" IS 'When true, users in this role can modify application settings, manage nav items, and configure the application.';


-- ===================== Other =====================

-- Application Roles: Role-based access control for Applications.
-- When an application has zero ApplicationRole records, all roles can access it (open access, backwards compatible).
-- When at least one ApplicationRole record exists, only roles with CanAccess=1 are permitted.

/* spUpdate Permissions for MJ: Application Roles */
