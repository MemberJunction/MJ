-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610121900__v6.2.x__User_IsTemplate.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."User"
ADD COLUMN "IsTemplate" BOOLEAN NOT NULL DEFAULT FALSE /* ============================================================================ */ /* Template users: User.IsTemplate */ /* ============================================================================ */ /* A template user is a configured account that exists to be copied: its pinned */ /* apps, saved views, personal settings, dashboards and conversations become the */ /* starting point for new users (an app's demo user, a team's onboarding setup). */ /* The flag gates the clone engine's template preset on MJ: Users, the only */ /* preset that may copy a user's dashboards and conversations; those stay */ /* uncopyable from an ordinary user, so one person's private work can never be */ /* duplicated into another account. It also drives the Explorer banner that */ /* warns anyone signed in as a template user that their changes are copied. */ /* Additive only. CodeGen owns the EntityField row, view, procedures and */ /* generated classes. PostgreSQL counterpart is produced by the release build. */ /* ============================================================================ */;

COMMENT ON COLUMN __mj."User"."IsTemplate" IS 'When true, this user is a template: its configuration (pinned apps, views, settings, dashboards, conversations) is copied to new users through the template clone preset or userHandling.newUserTemplate. Template users are for setting things up, not for everyday use; Explorer shows a banner while one is signed in.';

-- ╔══ HAND-FINISHED FOR POSTGRESQL: app-owned vwUsers ══╗
-- MJ: Users owns its base view (BaseViewGenerated = 0), so CodeGen never rewrites vwUsers. On SQL
-- Server the view picks up the new column; PostgreSQL froze its column list at CREATE. Without
-- this, spDeleteUnneededEntityFields deletes the IsTemplate EntityField row below (no matching
-- view column), and the metadata push fails with
-- `Lookup failed: No record found in 'MJ: Entity Fields' where ... Name='IsTemplate'`.
-- CREATE OR REPLACE may only append columns, so IsTemplate goes last; vwUserViews,
-- vwUserRecordLogs and the User CRUD functions that depend on the view are left in place.
-- ╚══════════════════════════════════════════════════════╝
CREATE OR REPLACE VIEW __mj."vwUsers" AS
 SELECT u."ID",
    u."Name",
    u."FirstName",
    u."LastName",
    u."Title",
    u."Email",
    u."Type",
    u."IsActive",
    u."LinkedRecordType",
    u."LinkedEntityID",
    u."LinkedEntityRecordID",
    u."EmployeeID",
    u."__mj_CreatedAt",
    u."__mj_UpdatedAt",
    u."UserImageURL",
    u."UserImageIconClass",
    (u."FirstName"::text || ' '::text) || u."LastName"::text AS "FirstLast",
    e."FirstLast" AS "EmployeeFirstLast",
    e."Email" AS "EmployeeEmail",
    e."Title" AS "EmployeeTitle",
    e."Supervisor" AS "EmployeeSupervisor",
    e."SupervisorEmail" AS "EmployeeSupervisorEmail",
    u."IsTemplate"
   FROM __mj."User" u
     LEFT JOIN __mj."vwEmployees" e ON u."EmployeeID" = e."ID";


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '71ca0e3d-dd96-4c08-a419-48c4fb25791f' OR ("EntityID" = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'IsTemplate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('71ca0e3d-dd96-4c08-a419-48c4fb25791f', 'E1238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Users */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1238F34-2837-EF11-86D4-6045BDEE16E6'), 'IsTemplate', 'Is Template', 'When true, this user is a template: its configuration (pinned apps, views, settings, dashboards, conversations) is copied to new users through the template clone preset or userHandling.newUserTemplate. Template users are for setting things up, not for everyday use; Explorer shows a banner while one is signed in.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Users
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_linked_entity_id"
    ON "__mj"."User" ("LinkedEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_employee_id"
    ON "__mj"."User" ("EmployeeID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Users
-- Item: Permissions for vwUsers
-- ============================================================
GRANT SELECT ON "__mj"."vwUsers" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwUsers" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwUsers" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Users
-- Item: spCreateUser
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR User
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateUser'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateUser"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_firstname_clear boolean DEFAULT false,
    p_firstname varchar(50) DEFAULT NULL,
    p_lastname_clear boolean DEFAULT false,
    p_lastname varchar(50) DEFAULT NULL,
    p_title_clear boolean DEFAULT false,
    p_title varchar(50) DEFAULT NULL,
    p_email varchar(100) DEFAULT NULL,
    p_type char(15) DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_linkedrecordtype char(10) DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid UUID DEFAULT NULL,
    p_linkedentityrecordid_clear boolean DEFAULT false,
    p_linkedentityrecordid varchar(450) DEFAULT NULL,
    p_employeeid_clear boolean DEFAULT false,
    p_employeeid UUID DEFAULT NULL,
    p_userimageurl_clear boolean DEFAULT false,
    p_userimageurl TEXT DEFAULT NULL,
    p_userimageiconclass_clear boolean DEFAULT false,
    p_userimageiconclass varchar(100) DEFAULT NULL,
    p_istemplate BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwUsers" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."User"
        (
            "ID",
            "Name",
                "FirstName",
                "LastName",
                "Title",
                "Email",
                "Type",
                "IsActive",
                "LinkedRecordType",
                "LinkedEntityID",
                "LinkedEntityRecordID",
                "EmployeeID",
                "UserImageURL",
                "UserImageIconClass",
                "IsTemplate"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_firstname_clear = true THEN NULL ELSE COALESCE(p_firstname, NULL) END,
                CASE WHEN p_lastname_clear = true THEN NULL ELSE COALESCE(p_lastname, NULL) END,
                CASE WHEN p_title_clear = true THEN NULL ELSE COALESCE(p_title, NULL) END,
                p_email,
                p_type,
                COALESCE(p_isactive, FALSE),
                COALESCE(p_linkedrecordtype, 'None'),
                CASE WHEN p_linkedentityid_clear = true THEN NULL ELSE COALESCE(p_linkedentityid, NULL) END,
                CASE WHEN p_linkedentityrecordid_clear = true THEN NULL ELSE COALESCE(p_linkedentityrecordid, NULL) END,
                CASE WHEN p_employeeid_clear = true THEN NULL ELSE COALESCE(p_employeeid, NULL) END,
                CASE WHEN p_userimageurl_clear = true THEN NULL ELSE COALESCE(p_userimageurl, NULL) END,
                CASE WHEN p_userimageiconclass_clear = true THEN NULL ELSE COALESCE(p_userimageiconclass, NULL) END,
                COALESCE(p_istemplate, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwUsers"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUser" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUser" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Users
-- Item: spUpdateUser
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR User
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateUser'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateUser"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_firstname_clear boolean DEFAULT false,
    p_firstname varchar(50) DEFAULT NULL,
    p_lastname_clear boolean DEFAULT false,
    p_lastname varchar(50) DEFAULT NULL,
    p_title_clear boolean DEFAULT false,
    p_title varchar(50) DEFAULT NULL,
    p_email varchar(100) DEFAULT NULL,
    p_type char(15) DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_linkedrecordtype char(10) DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid UUID DEFAULT NULL,
    p_linkedentityrecordid_clear boolean DEFAULT false,
    p_linkedentityrecordid varchar(450) DEFAULT NULL,
    p_employeeid_clear boolean DEFAULT false,
    p_employeeid UUID DEFAULT NULL,
    p_userimageurl_clear boolean DEFAULT false,
    p_userimageurl TEXT DEFAULT NULL,
    p_userimageiconclass_clear boolean DEFAULT false,
    p_userimageiconclass varchar(100) DEFAULT NULL,
    p_istemplate BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwUsers" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."User"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "FirstName" = CASE WHEN p_firstname_clear = true THEN NULL ELSE COALESCE(p_firstname, "FirstName") END,
        "LastName" = CASE WHEN p_lastname_clear = true THEN NULL ELSE COALESCE(p_lastname, "LastName") END,
        "Title" = CASE WHEN p_title_clear = true THEN NULL ELSE COALESCE(p_title, "Title") END,
        "Email" = COALESCE(p_email, "Email"),
        "Type" = COALESCE(p_type, "Type"),
        "IsActive" = COALESCE(p_isactive, "IsActive"),
        "LinkedRecordType" = COALESCE(p_linkedrecordtype, "LinkedRecordType"),
        "LinkedEntityID" = CASE WHEN p_linkedentityid_clear = true THEN NULL ELSE COALESCE(p_linkedentityid, "LinkedEntityID") END,
        "LinkedEntityRecordID" = CASE WHEN p_linkedentityrecordid_clear = true THEN NULL ELSE COALESCE(p_linkedentityrecordid, "LinkedEntityRecordID") END,
        "EmployeeID" = CASE WHEN p_employeeid_clear = true THEN NULL ELSE COALESCE(p_employeeid, "EmployeeID") END,
        "UserImageURL" = CASE WHEN p_userimageurl_clear = true THEN NULL ELSE COALESCE(p_userimageurl, "UserImageURL") END,
        "UserImageIconClass" = CASE WHEN p_userimageiconclass_clear = true THEN NULL ELSE COALESCE(p_userimageiconclass, "UserImageIconClass") END,
        "IsTemplate" = COALESCE(p_istemplate, "IsTemplate")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwUsers"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUser" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUser" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the User table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_user"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_user" ON "__mj"."User";

CREATE TRIGGER "trg_update_user"
BEFORE UPDATE ON "__mj"."User"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_user"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Users
-- Item: spDeleteUser
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR User
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteUser'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteUser"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."User"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteUser" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteUser" TO "cdp_Developer";
