-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610271915__v6.2.x__CommunicationProvider_UserDelegatedOAuth_Gates.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."CommunicationProvider"
  ADD COLUMN "AllowUserDelegatedOAuth" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "AllowedOAuthTenantIDs" VARCHAR(1000) NULL
 /* ===================================================================================== */ /* Migration: Communication Provider — Posture 3 per-user delegated OAuth (3LO) gates */ /* Version:   v6.2.x */ /* Description: */ /*   Extends [CommunicationProvider] ("MJ: Communication Providers") with the two */ /*   administrator-controlled gates that `CommunicationUserOAuthService` enforces for */ /*   Posture 3 (per-user delegated OAuth 2.0 + PKCE), which is OFF by default: */ /*     - AllowUserDelegatedOAuth (Gate 1): enterprise-wide master switch. Unless an */ /*       administrator sets it to 1, no user can initiate a personal OAuth flow for */ /*       this provider. Default 0. */ /*     - AllowedOAuthTenantIDs (Gate 3): optional comma-separated allowlist of identity */ /*       tenant identifiers a user token must carry (Azure AD `tid`, Google Workspace */ /*       `hd`). NULL means no tenant restriction beyond Gate 2. */ /*   Gate 2 (AllowedEmailDomains) and the EnterpriseScopeMode posture already exist on */ /*   this table (V202610171900__v6.2.x__AIAgentUserPolicy_And_UserRoutine_Wake.sql). */ /* ===================================================================================== */ /* ===================================================================================== */ /* 1. DDL Operations */ /* ===================================================================================== */;
/* ===================================================================================== */ /* 2. Extended Properties (column descriptions) */ /* ===================================================================================== */;

COMMENT ON COLUMN __mj."CommunicationProvider"."AllowUserDelegatedOAuth" IS 'Posture 3 master switch (Gate 1). When 1, users may connect their own mailbox/calendar to this provider through per-user delegated OAuth 2.0 (3LO) with PKCE, subject to AllowedEmailDomains and AllowedOAuthTenantIDs. Default 0: no user can initiate a personal OAuth flow.';

COMMENT ON COLUMN __mj."CommunicationProvider"."AllowedOAuthTenantIDs" IS 'Optional comma-separated allowlist of identity tenant identifiers (Gate 3) that a user-delegated OAuth token must carry: Azure AD tenant IDs (tid) or Google Workspace hosted domains (hd). NULL means no tenant restriction beyond AllowedEmailDomains.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'db8da48f-9dc9-4cdb-8259-4627202775f1' OR ("EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AllowUserDelegatedOAuth')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('db8da48f-9dc9-4cdb-8259-4627202775f1', '43248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Communication Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6'), 'AllowUserDelegatedOAuth', 'Allow User Delegated O Auth', 'Posture 3 master switch (Gate 1). When 1, users may connect their own mailbox/calendar to this provider through per-user delegated OAuth 2.0 (3LO) with PKCE, subject to AllowedEmailDomains and AllowedOAuthTenantIDs. Default 0: no user can initiate a personal OAuth flow.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Dropdown', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1ec6ed53-944d-463c-ba39-d8304a47ceb3' OR ("EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AllowedOAuthTenantIDs')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1ec6ed53-944d-463c-ba39-d8304a47ceb3', '43248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Communication Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6'), 'AllowedOAuthTenantIDs', 'Allowed O Auth Tenant I Ds', 'Optional comma-separated allowlist of identity tenant identifiers (Gate 3) that a user-delegated OAuth token must carry: Azure AD tenant IDs (tid) or Google Workspace hosted domains (hd). NULL means no tenant restriction beyond AllowedEmailDomains.', 'nvarchar', 2000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Dropdown', NOW(), NOW());
  END IF;
END $$;

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" IN (
    SELECT
      "e"."ID"
    FROM __mj."Entity" AS "e"
    WHERE
      "e"."AllowUserSearchAPI" = TRUE
      AND "e"."AutoUpdateAllowUserSearchAPI" = TRUE
      AND "e"."VirtualEntity" = FALSE
      AND COALESCE("e"."FullTextSearchEnabled", FALSE) = FALSE
      AND NOT "e"."SchemaName" IN ('sys', 'staging')
      AND NOT EXISTS(
        SELECT
          1
        FROM __mj."EntityField" AS "f2"
        WHERE
          "f2"."EntityID" = "e"."ID" AND "f2"."IncludeInUserSearchAPI" = TRUE
      )
  );

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Communication Providers
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_communication_provider_default_credential_id"
    ON "__mj"."CommunicationProvider" ("DefaultCredentialID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Communication Providers
-- Item: vwCommunicationProviders
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Communication Providers
-----               SCHEMA:      __mj
-----               BASE TABLE:  CommunicationProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwCommunicationProviders"
AS
SELECT
    c.*,
    MJCredential_DefaultCredentialID."Name" AS "DefaultCredential"
FROM
    "__mj"."CommunicationProvider" AS c
LEFT OUTER JOIN
    "__mj"."Credential" AS MJCredential_DefaultCredentialID
  ON
    "c"."DefaultCredentialID" = MJCredential_DefaultCredentialID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwCommunicationProviders'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwCommunicationProviders'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwCommunicationProviders" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwCommunicationProviders" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwCommunicationProviders" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwCommunicationProviders" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Communication Providers
-- Item: spCreateCommunicationProvider
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR CommunicationProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateCommunicationProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateCommunicationProvider"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_supportssending BOOLEAN DEFAULT NULL,
    p_supportsreceiving BOOLEAN DEFAULT NULL,
    p_supportsscheduledsending BOOLEAN DEFAULT NULL,
    p_supportsforwarding BOOLEAN DEFAULT NULL,
    p_supportsreplying BOOLEAN DEFAULT NULL,
    p_supportsdrafts BOOLEAN DEFAULT NULL,
    p_supportscalendar BOOLEAN DEFAULT NULL,
    p_supportsfreebusy BOOLEAN DEFAULT NULL,
    p_enterprisescopemode varchar(40) DEFAULT NULL,
    p_allowedemaildomains_clear boolean DEFAULT false,
    p_allowedemaildomains varchar(500) DEFAULT NULL,
    p_defaultcredentialid_clear boolean DEFAULT false,
    p_defaultcredentialid UUID DEFAULT NULL,
    p_allowuserdelegatedoauth BOOLEAN DEFAULT NULL,
    p_allowedoauthtenantids_clear boolean DEFAULT false,
    p_allowedoauthtenantids varchar(1000) DEFAULT NULL
) RETURNS SETOF "__mj"."vwCommunicationProviders" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."CommunicationProvider"
        (
            "ID",
            "Name",
                "Description",
                "Status",
                "SupportsSending",
                "SupportsReceiving",
                "SupportsScheduledSending",
                "SupportsForwarding",
                "SupportsReplying",
                "SupportsDrafts",
                "SupportsCalendar",
                "SupportsFreeBusy",
                "EnterpriseScopeMode",
                "AllowedEmailDomains",
                "DefaultCredentialID",
                "AllowUserDelegatedOAuth",
                "AllowedOAuthTenantIDs"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_status, 'Disabled'),
                COALESCE(p_supportssending, TRUE),
                COALESCE(p_supportsreceiving, FALSE),
                COALESCE(p_supportsscheduledsending, FALSE),
                COALESCE(p_supportsforwarding, FALSE),
                COALESCE(p_supportsreplying, FALSE),
                COALESCE(p_supportsdrafts, FALSE),
                COALESCE(p_supportscalendar, FALSE),
                COALESCE(p_supportsfreebusy, FALSE),
                COALESCE(p_enterprisescopemode, 'UtilityMailboxesOnly'),
                CASE WHEN p_allowedemaildomains_clear = true THEN NULL ELSE COALESCE(p_allowedemaildomains, NULL) END,
                CASE WHEN p_defaultcredentialid_clear = true THEN NULL ELSE COALESCE(p_defaultcredentialid, NULL) END,
                COALESCE(p_allowuserdelegatedoauth, FALSE),
                CASE WHEN p_allowedoauthtenantids_clear = true THEN NULL ELSE COALESCE(p_allowedoauthtenantids, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwCommunicationProviders"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCommunicationProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCommunicationProvider" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Communication Providers
-- Item: spUpdateCommunicationProvider
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR CommunicationProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateCommunicationProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateCommunicationProvider"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_supportssending BOOLEAN DEFAULT NULL,
    p_supportsreceiving BOOLEAN DEFAULT NULL,
    p_supportsscheduledsending BOOLEAN DEFAULT NULL,
    p_supportsforwarding BOOLEAN DEFAULT NULL,
    p_supportsreplying BOOLEAN DEFAULT NULL,
    p_supportsdrafts BOOLEAN DEFAULT NULL,
    p_supportscalendar BOOLEAN DEFAULT NULL,
    p_supportsfreebusy BOOLEAN DEFAULT NULL,
    p_enterprisescopemode varchar(40) DEFAULT NULL,
    p_allowedemaildomains_clear boolean DEFAULT false,
    p_allowedemaildomains varchar(500) DEFAULT NULL,
    p_defaultcredentialid_clear boolean DEFAULT false,
    p_defaultcredentialid UUID DEFAULT NULL,
    p_allowuserdelegatedoauth BOOLEAN DEFAULT NULL,
    p_allowedoauthtenantids_clear boolean DEFAULT false,
    p_allowedoauthtenantids varchar(1000) DEFAULT NULL
) RETURNS SETOF "__mj"."vwCommunicationProviders" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."CommunicationProvider"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Status" = COALESCE(p_status, "Status"),
        "SupportsSending" = COALESCE(p_supportssending, "SupportsSending"),
        "SupportsReceiving" = COALESCE(p_supportsreceiving, "SupportsReceiving"),
        "SupportsScheduledSending" = COALESCE(p_supportsscheduledsending, "SupportsScheduledSending"),
        "SupportsForwarding" = COALESCE(p_supportsforwarding, "SupportsForwarding"),
        "SupportsReplying" = COALESCE(p_supportsreplying, "SupportsReplying"),
        "SupportsDrafts" = COALESCE(p_supportsdrafts, "SupportsDrafts"),
        "SupportsCalendar" = COALESCE(p_supportscalendar, "SupportsCalendar"),
        "SupportsFreeBusy" = COALESCE(p_supportsfreebusy, "SupportsFreeBusy"),
        "EnterpriseScopeMode" = COALESCE(p_enterprisescopemode, "EnterpriseScopeMode"),
        "AllowedEmailDomains" = CASE WHEN p_allowedemaildomains_clear = true THEN NULL ELSE COALESCE(p_allowedemaildomains, "AllowedEmailDomains") END,
        "DefaultCredentialID" = CASE WHEN p_defaultcredentialid_clear = true THEN NULL ELSE COALESCE(p_defaultcredentialid, "DefaultCredentialID") END,
        "AllowUserDelegatedOAuth" = COALESCE(p_allowuserdelegatedoauth, "AllowUserDelegatedOAuth"),
        "AllowedOAuthTenantIDs" = CASE WHEN p_allowedoauthtenantids_clear = true THEN NULL ELSE COALESCE(p_allowedoauthtenantids, "AllowedOAuthTenantIDs") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwCommunicationProviders"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCommunicationProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCommunicationProvider" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommunicationProvider table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_communication_provider"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_communication_provider" ON "__mj"."CommunicationProvider";

CREATE TRIGGER "trg_update_communication_provider"
BEFORE UPDATE ON "__mj"."CommunicationProvider"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_communication_provider"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Communication Providers
-- Item: spDeleteCommunicationProvider
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR CommunicationProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteCommunicationProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteCommunicationProvider"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."CommunicationProvider"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCommunicationProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCommunicationProvider" TO "cdp_Developer";
