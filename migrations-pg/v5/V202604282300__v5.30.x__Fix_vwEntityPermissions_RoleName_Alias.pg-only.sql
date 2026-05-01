-- Recreate vwEntityPermissions with a quoted RoleName alias.
--
-- The PG baseline shipped with the SQL Server source verbatim:
--     "Role_RoleName"."Name" as RoleName    ← UNQUOTED
-- PostgreSQL case-folds the alias to lowercase `rolename` when the view is
-- created. Runtime queries reference the field as the entity-metadata field
-- name `RoleName` (case-preserved double-quoted), so PG raises
-- `column "RoleName" does not exist` whenever anything reads from
-- vwEntityPermissions (e.g. opening any Role record's permissions tab).
--
-- The root cause was a case-sensitive regex in the SQL converter
-- (`/\bAS\s+.../` only matched uppercase `AS`, missed the lowercase `as`
-- in the source). The converter is fixed in this same change so future
-- regenerations don't drift again. This migration recreates the only
-- baseline view that ended up with the bad alias.
--
-- Why DROP VIEW … CASCADE: PostgreSQL's CREATE OR REPLACE VIEW only allows
-- *appending* columns; renaming a column (rolename → RoleName) requires
-- dropping and recreating. The CASCADE drops the two SP functions whose
-- return type is SETOF vwEntityPermissions, so we recreate those (and
-- re-grant) right after the view is rebuilt.

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwEntityPermissions"
AS SELECT
    e.*,
    "Entity_EntityID"."Name" AS "Entity",
    "Role_RoleName"."Name" AS "RoleName",
    "Role_RoleName"."SQLName" AS "RoleSQLName",
    rlsC."Name" AS "CreateRLSFilter",
    rlsR."Name" AS "ReadRLSFilter",
    rlsU."Name" AS "UpdateRLSFilter",
    rlsD."Name" AS "DeleteRLSFilter"
FROM
    ${flyway:defaultSchema}."EntityPermission" AS e
INNER JOIN
    ${flyway:defaultSchema}."Entity" AS "Entity_EntityID"
  ON
    e."EntityID" = "Entity_EntityID"."ID"
INNER JOIN
    ${flyway:defaultSchema}."Role" AS "Role_RoleName"
  ON
    e."RoleID" = "Role_RoleName"."ID"
LEFT OUTER JOIN
    ${flyway:defaultSchema}."RowLevelSecurityFilter" rlsC
  ON
    e."CreateRLSFilterID" = rlsC."ID"
LEFT OUTER JOIN
    ${flyway:defaultSchema}."RowLevelSecurityFilter" rlsR
  ON
    e."ReadRLSFilterID" = rlsR."ID"
LEFT OUTER JOIN
    ${flyway:defaultSchema}."RowLevelSecurityFilter" rlsU
  ON
    e."UpdateRLSFilterID" = rlsU."ID"
LEFT OUTER JOIN
    ${flyway:defaultSchema}."RowLevelSecurityFilter" rlsD
  ON
    e."DeleteRLSFilterID" = rlsD."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS ${flyway:defaultSchema}."vwEntityPermissions" CASCADE;
  EXECUTE vsql;
END $do$;

-- Recreate the two CRUD functions that depend on vwEntityPermissions and
-- got dropped by the CASCADE above. Definitions mirror the v5.0 baseline.

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateEntityPermission"(
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
    IN p_DeleteRLSFilterID UUID
)
RETURNS SETOF ${flyway:defaultSchema}."vwEntityPermissions" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."EntityPermission"
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
        "DeleteRLSFilterID" = p_DeleteRLSFilterID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."vwEntityPermissions" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."vwEntityPermissions" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateEntityPermission"(
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
    IN p_DeleteRLSFilterID UUID DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."vwEntityPermissions" AS
$$
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO ${flyway:defaultSchema}."EntityPermission"
            ("ID", "EntityID", "RoleID", "CanCreate", "CanRead", "CanUpdate", "CanDelete",
             "ReadRLSFilterID", "CreateRLSFilterID", "UpdateRLSFilterID", "DeleteRLSFilterID")
        VALUES
            (p_ID, p_EntityID, p_RoleID,
             COALESCE(p_CanCreate, FALSE), COALESCE(p_CanRead, FALSE),
             COALESCE(p_CanUpdate, FALSE), COALESCE(p_CanDelete, FALSE),
             p_ReadRLSFilterID, p_CreateRLSFilterID, p_UpdateRLSFilterID, p_DeleteRLSFilterID);
    ELSE
        INSERT INTO ${flyway:defaultSchema}."EntityPermission"
            ("EntityID", "RoleID", "CanCreate", "CanRead", "CanUpdate", "CanDelete",
             "ReadRLSFilterID", "CreateRLSFilterID", "UpdateRLSFilterID", "DeleteRLSFilterID")
        VALUES
            (p_EntityID, p_RoleID,
             COALESCE(p_CanCreate, FALSE), COALESCE(p_CanRead, FALSE),
             COALESCE(p_CanUpdate, FALSE), COALESCE(p_CanDelete, FALSE),
             p_ReadRLSFilterID, p_CreateRLSFilterID, p_UpdateRLSFilterID, p_DeleteRLSFilterID);
    END IF;
    RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."vwEntityPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

-- Re-grant EXECUTE on the recreated functions (best-effort, ignore role-missing errors).
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateEntityPermission" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateEntityPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateEntityPermission" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateEntityPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
