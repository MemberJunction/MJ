-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606221530__v5.43.x__Remote_Operation_AI_Authoring.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."RemoteOperation"
  ADD COLUMN "CodeLocked" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "CodeComments" TEXT NULL,
  ADD COLUMN "Libraries" TEXT NULL
 /* Remote Operations — AI-from-Description authoring (RO-4) support. */ /* Additive only. The RemoteOperation + RemoteOperationCategory tables already shipped in v5.42 */ /* (V202606201145__v5.42.x__Record_Set_Processing.sql, already in `next`). This adds the three columns the */ /* AI-authoring pipeline needs, mirroring the Generated-Actions model on MJ: Actions: */ /*   * CodeLocked    — when set, the AI body is frozen (Save() skips regeneration), same as Action.CodeLocked. */ /*   * CodeComments  — the model's explanation of the generated body (the CodeComments analog). */ /*   * Libraries     — JSON array of { Library, ItemsUsed[] } the generated body imports; bound to the */ /*                     RemoteOperationLibrary JSONType via metadata sync (.entity-field-jsontype-remote-operations.json) */ /*                     so CodeGen emits a strongly-typed `LibrariesObject` accessor. No junction table — */ /*                     the library list is intrinsic, op-owned content. */;

COMMENT ON COLUMN __mj."RemoteOperation"."CodeLocked" IS 'When 1, the AI-generated Code is frozen and Save() will not regenerate it even if Description changes (the Generated-Actions CodeLocked analog). Default 0.';

COMMENT ON COLUMN __mj."RemoteOperation"."CodeComments" IS 'The model''s explanation / comments for the AI-generated Code (populated alongside Code when GenerationType=AI). Human-facing review aid.';

COMMENT ON COLUMN __mj."RemoteOperation"."Libraries" IS 'JSON array of the libraries the generated body imports: [{ "Library": "@memberjunction/ai-prompts", "ItemsUsed": ["AIPromptRunner"] }, ...]. Bound to the RemoteOperationLibrary JSONType via metadata sync so CodeGen emits a typed LibrariesObject accessor; CodeGen uses it to emit the imports at the top of the generated remote_operations.ts. NULL/empty = only the default always-available libraries are imported.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8ec0b0d8-f51d-4e94-86d0-98bfa006dd48' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'CodeLocked')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8ec0b0d8-f51d-4e94-86d0-98bfa006dd48', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100058, 'CodeLocked', 'Code Locked', 'When 1, the AI-generated Code is frozen and Save() will not regenerate it even if Description changes (the Generated-Actions CodeLocked analog). Default 0.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '664e4154-934f-4767-8dd1-2d6d9af599b1' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'CodeComments')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('664e4154-934f-4767-8dd1-2d6d9af599b1', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100059, 'CodeComments', 'Code Comments', 'The model''s explanation / comments for the AI-generated Code (populated alongside Code when GenerationType=AI). Human-facing review aid.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2b746356-521b-4974-8c5a-099f6dfa17ae' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'Libraries')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2b746356-521b-4974-8c5a-099f6dfa17ae', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100060, 'Libraries', 'Libraries', 'JSON array of the libraries the generated body imports: [{ "Library": "@memberjunction/ai-prompts", "ItemsUsed": ["AIPromptRunner"] }, ...]. Bound to the RemoteOperationLibrary JSONType via metadata sync so CodeGen emits a typed LibrariesObject accessor; CodeGen uses it to emit the imports at the top of the generated remote_operations.ts. NULL/empty = only the default always-available libraries are imported.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D6662178-7C96-48BE-9EEE-1CEE960277C4'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '4BDE9929-8999-490C-AAB7-33755D18FD31'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'D282A96B-D93F-46BE-A966-39AABF607537'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '4DC009D7-A719-4ACA-BD04-BFFABA9AC432'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 31 fields */ /* UPDATE Entity Field Category Info MJ: Remote Operations.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A1B3D99B-A135-43FA-BC27-97809AA1BE6B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9B2E73F0-D95D-4B80-B3EF-D2570D9CE87A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '077E22CF-092C-4B46-AAE1-FF2FC99A5ABD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D282A96B-D93F-46BE-A966-39AABF607537' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.OperationKey */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4DC009D7-A719-4ACA-BD04-BFFABA9AC432' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CategoryID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E614810B-D58B-49D3-8BB6-875FD70F17FA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4BDE9929-8999-490C-AAB7-33755D18FD31' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.Category */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7D944E8F-A2F0-426E-9531-BFE8BEC27549' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.InputTypeName */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3261C71D-480F-431F-949B-A654B19EA426' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.InputTypeDefinition */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'TypeScript'
WHERE
  "ID" = 'B9141D93-64B2-4903-B550-5CFCA72637CB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.InputTypeIsArray */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Input Is Array', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5AE69D4C-5B11-4DF3-98B3-4940C76611F3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.OutputTypeName */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2ADFF8A2-ED60-4A3E-973A-CFE5B4A6ED99' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.OutputTypeDefinition */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'TypeScript'
WHERE
  "ID" = '7ACB3F9F-1163-4614-98AA-6A343E878AAD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.OutputTypeIsArray */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Output Is Array', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4390D029-D795-4007-8EE9-F501DF1A7F65' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.ContractFingerprint */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '80C6B5D2-7567-4A63-9A1A-17677A34BFA5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.ExecutionMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C34E9634-B464-4297-89D7-C7120BD1FB78' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.RequiredScope */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '58125CD2-4955-4088-B3BD-CC4034DA597A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.RequiresSystemUser */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5F825817-3679-41B6-86FA-747065D9825E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CacheTTLSeconds */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '814591AB-4B99-4B4E-BFD0-24CABCABBD78' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.TimeoutMS */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B61AFDE6-BA4A-40B9-9C88-469BC568591F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.MaxConcurrency */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EA3FF7AE-094C-470A-A653-219D56FB6ED3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.GenerationType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D6662178-7C96-48BE-9EEE-1CEE960277C4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.Code */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Code', "ExtendedType" = 'Code', "CodeType" = 'TypeScript'
WHERE
  "ID" = '759AA844-3C64-45CF-A014-94CA7E8E1989' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovalStatus */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Code Approval Status', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A0FE0FFC-FD02-4064-9C2A-BB903ADF7296' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovedByUserID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Code Approved By User ID', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C62BC997-B1B4-49AF-83C8-5B0A2E9F66E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Code Approved At', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B7640E68-0ED9-4223-8BCB-60145D6088AF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '39380D84-086B-4F99-AE8C-BB59C7E608A9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovedByUser */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Code Approved By User', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B3DD7A6D-995A-4E4E-A9E3-A0395C0337A1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CodeLocked */
UPDATE __mj."EntityField" SET "Category" = 'Implementation and Approval', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8EC0B0D8-F51D-4E94-86D0-98BFA006DD48' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CodeComments */
UPDATE __mj."EntityField" SET "Category" = 'Implementation and Approval', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '664E4154-934F-4767-8DD1-2D6D9AF599B1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.Libraries */
UPDATE __mj."EntityField" SET "Category" = 'Implementation and Approval', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2B746356-521B-4974-8C5A-099F6DFA17AE' AND "AutoUpdateCategory" = TRUE;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operations
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_remote_operation_category_id"
    ON __mj."RemoteOperation" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_remote_operation_code_approved_by_user_id"
    ON __mj."RemoteOperation" ("CodeApprovedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operations
-- Item: vwRemoteOperations
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Remote Operations
-----               SCHEMA:      __mj
-----               BASE TABLE:  RemoteOperation
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwRemoteOperations"
AS
SELECT
    r.*,
    MJRemoteOperationCategory_CategoryID."Name" AS "Category",
    MJUser_CodeApprovedByUserID."Name" AS "CodeApprovedByUser"
FROM
    __mj."RemoteOperation" AS r
LEFT OUTER JOIN
    __mj."RemoteOperationCategory" AS MJRemoteOperationCategory_CategoryID
  ON
    "r"."CategoryID" = MJRemoteOperationCategory_CategoryID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_CodeApprovedByUserID
  ON
    "r"."CodeApprovedByUserID" = MJUser_CodeApprovedByUserID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwRemoteOperations'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwRemoteOperations'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwRemoteOperations'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwRemoteOperations" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwRemoteOperations" TO "cdp_UI";
GRANT SELECT ON __mj."vwRemoteOperations" TO "cdp_Developer";
GRANT SELECT ON __mj."vwRemoteOperations" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operations
-- Item: spCreateRemoteOperation
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RemoteOperation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRemoteOperation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateRemoteOperation"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_operationkey varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_inputtypename_clear boolean DEFAULT false,
    p_inputtypename varchar(255) DEFAULT NULL,
    p_inputtypedefinition_clear boolean DEFAULT false,
    p_inputtypedefinition TEXT DEFAULT NULL,
    p_inputtypeisarray BOOLEAN DEFAULT NULL,
    p_outputtypename_clear boolean DEFAULT false,
    p_outputtypename varchar(255) DEFAULT NULL,
    p_outputtypedefinition_clear boolean DEFAULT false,
    p_outputtypedefinition TEXT DEFAULT NULL,
    p_outputtypeisarray BOOLEAN DEFAULT NULL,
    p_executionmode varchar(20) DEFAULT NULL,
    p_requiredscope_clear boolean DEFAULT false,
    p_requiredscope varchar(255) DEFAULT NULL,
    p_requiressystemuser BOOLEAN DEFAULT NULL,
    p_generationtype varchar(20) DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code TEXT DEFAULT NULL,
    p_codeapprovalstatus varchar(20) DEFAULT NULL,
    p_codeapprovedbyuserid_clear boolean DEFAULT false,
    p_codeapprovedbyuserid UUID DEFAULT NULL,
    p_codeapprovedat_clear boolean DEFAULT false,
    p_codeapprovedat TIMESTAMPTZ DEFAULT NULL,
    p_contractfingerprint_clear boolean DEFAULT false,
    p_contractfingerprint varchar(100) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_timeoutms_clear boolean DEFAULT false,
    p_timeoutms int DEFAULT NULL,
    p_maxconcurrency_clear boolean DEFAULT false,
    p_maxconcurrency int DEFAULT NULL,
    p_codelocked BOOLEAN DEFAULT NULL,
    p_codecomments_clear boolean DEFAULT false,
    p_codecomments TEXT DEFAULT NULL,
    p_libraries_clear boolean DEFAULT false,
    p_libraries TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwRemoteOperations" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."RemoteOperation"
        (
            "ID",
            "Name",
                "OperationKey",
                "CategoryID",
                "Description",
                "InputTypeName",
                "InputTypeDefinition",
                "InputTypeIsArray",
                "OutputTypeName",
                "OutputTypeDefinition",
                "OutputTypeIsArray",
                "ExecutionMode",
                "RequiredScope",
                "RequiresSystemUser",
                "GenerationType",
                "Code",
                "CodeApprovalStatus",
                "CodeApprovedByUserID",
                "CodeApprovedAt",
                "ContractFingerprint",
                "Status",
                "CacheTTLSeconds",
                "TimeoutMS",
                "MaxConcurrency",
                "CodeLocked",
                "CodeComments",
                "Libraries"
        )
    VALUES
        (
            v_new_id,
            p_name,
                p_operationkey,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_inputtypename_clear = true THEN NULL ELSE COALESCE(p_inputtypename, NULL) END,
                CASE WHEN p_inputtypedefinition_clear = true THEN NULL ELSE COALESCE(p_inputtypedefinition, NULL) END,
                COALESCE(p_inputtypeisarray, FALSE),
                CASE WHEN p_outputtypename_clear = true THEN NULL ELSE COALESCE(p_outputtypename, NULL) END,
                CASE WHEN p_outputtypedefinition_clear = true THEN NULL ELSE COALESCE(p_outputtypedefinition, NULL) END,
                COALESCE(p_outputtypeisarray, FALSE),
                COALESCE(p_executionmode, 'Sync'),
                CASE WHEN p_requiredscope_clear = true THEN NULL ELSE COALESCE(p_requiredscope, NULL) END,
                COALESCE(p_requiressystemuser, FALSE),
                COALESCE(p_generationtype, 'Manual'),
                CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, NULL) END,
                COALESCE(p_codeapprovalstatus, 'Pending'),
                CASE WHEN p_codeapprovedbyuserid_clear = true THEN NULL ELSE COALESCE(p_codeapprovedbyuserid, NULL) END,
                CASE WHEN p_codeapprovedat_clear = true THEN NULL ELSE COALESCE(p_codeapprovedat, NULL) END,
                CASE WHEN p_contractfingerprint_clear = true THEN NULL ELSE COALESCE(p_contractfingerprint, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, NULL) END,
                CASE WHEN p_timeoutms_clear = true THEN NULL ELSE COALESCE(p_timeoutms, NULL) END,
                CASE WHEN p_maxconcurrency_clear = true THEN NULL ELSE COALESCE(p_maxconcurrency, NULL) END,
                COALESCE(p_codelocked, FALSE),
                CASE WHEN p_codecomments_clear = true THEN NULL ELSE COALESCE(p_codecomments, NULL) END,
                CASE WHEN p_libraries_clear = true THEN NULL ELSE COALESCE(p_libraries, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwRemoteOperations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateRemoteOperation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateRemoteOperation" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operations
-- Item: spUpdateRemoteOperation
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RemoteOperation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRemoteOperation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateRemoteOperation"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_operationkey varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_inputtypename_clear boolean DEFAULT false,
    p_inputtypename varchar(255) DEFAULT NULL,
    p_inputtypedefinition_clear boolean DEFAULT false,
    p_inputtypedefinition TEXT DEFAULT NULL,
    p_inputtypeisarray BOOLEAN DEFAULT NULL,
    p_outputtypename_clear boolean DEFAULT false,
    p_outputtypename varchar(255) DEFAULT NULL,
    p_outputtypedefinition_clear boolean DEFAULT false,
    p_outputtypedefinition TEXT DEFAULT NULL,
    p_outputtypeisarray BOOLEAN DEFAULT NULL,
    p_executionmode varchar(20) DEFAULT NULL,
    p_requiredscope_clear boolean DEFAULT false,
    p_requiredscope varchar(255) DEFAULT NULL,
    p_requiressystemuser BOOLEAN DEFAULT NULL,
    p_generationtype varchar(20) DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code TEXT DEFAULT NULL,
    p_codeapprovalstatus varchar(20) DEFAULT NULL,
    p_codeapprovedbyuserid_clear boolean DEFAULT false,
    p_codeapprovedbyuserid UUID DEFAULT NULL,
    p_codeapprovedat_clear boolean DEFAULT false,
    p_codeapprovedat TIMESTAMPTZ DEFAULT NULL,
    p_contractfingerprint_clear boolean DEFAULT false,
    p_contractfingerprint varchar(100) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_timeoutms_clear boolean DEFAULT false,
    p_timeoutms int DEFAULT NULL,
    p_maxconcurrency_clear boolean DEFAULT false,
    p_maxconcurrency int DEFAULT NULL,
    p_codelocked BOOLEAN DEFAULT NULL,
    p_codecomments_clear boolean DEFAULT false,
    p_codecomments TEXT DEFAULT NULL,
    p_libraries_clear boolean DEFAULT false,
    p_libraries TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwRemoteOperations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."RemoteOperation"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "OperationKey" = COALESCE(p_operationkey, "OperationKey"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "InputTypeName" = CASE WHEN p_inputtypename_clear = true THEN NULL ELSE COALESCE(p_inputtypename, "InputTypeName") END,
        "InputTypeDefinition" = CASE WHEN p_inputtypedefinition_clear = true THEN NULL ELSE COALESCE(p_inputtypedefinition, "InputTypeDefinition") END,
        "InputTypeIsArray" = COALESCE(p_inputtypeisarray, "InputTypeIsArray"),
        "OutputTypeName" = CASE WHEN p_outputtypename_clear = true THEN NULL ELSE COALESCE(p_outputtypename, "OutputTypeName") END,
        "OutputTypeDefinition" = CASE WHEN p_outputtypedefinition_clear = true THEN NULL ELSE COALESCE(p_outputtypedefinition, "OutputTypeDefinition") END,
        "OutputTypeIsArray" = COALESCE(p_outputtypeisarray, "OutputTypeIsArray"),
        "ExecutionMode" = COALESCE(p_executionmode, "ExecutionMode"),
        "RequiredScope" = CASE WHEN p_requiredscope_clear = true THEN NULL ELSE COALESCE(p_requiredscope, "RequiredScope") END,
        "RequiresSystemUser" = COALESCE(p_requiressystemuser, "RequiresSystemUser"),
        "GenerationType" = COALESCE(p_generationtype, "GenerationType"),
        "Code" = CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, "Code") END,
        "CodeApprovalStatus" = COALESCE(p_codeapprovalstatus, "CodeApprovalStatus"),
        "CodeApprovedByUserID" = CASE WHEN p_codeapprovedbyuserid_clear = true THEN NULL ELSE COALESCE(p_codeapprovedbyuserid, "CodeApprovedByUserID") END,
        "CodeApprovedAt" = CASE WHEN p_codeapprovedat_clear = true THEN NULL ELSE COALESCE(p_codeapprovedat, "CodeApprovedAt") END,
        "ContractFingerprint" = CASE WHEN p_contractfingerprint_clear = true THEN NULL ELSE COALESCE(p_contractfingerprint, "ContractFingerprint") END,
        "Status" = COALESCE(p_status, "Status"),
        "CacheTTLSeconds" = CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, "CacheTTLSeconds") END,
        "TimeoutMS" = CASE WHEN p_timeoutms_clear = true THEN NULL ELSE COALESCE(p_timeoutms, "TimeoutMS") END,
        "MaxConcurrency" = CASE WHEN p_maxconcurrency_clear = true THEN NULL ELSE COALESCE(p_maxconcurrency, "MaxConcurrency") END,
        "CodeLocked" = COALESCE(p_codelocked, "CodeLocked"),
        "CodeComments" = CASE WHEN p_codecomments_clear = true THEN NULL ELSE COALESCE(p_codecomments, "CodeComments") END,
        "Libraries" = CASE WHEN p_libraries_clear = true THEN NULL ELSE COALESCE(p_libraries, "Libraries") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwRemoteOperations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateRemoteOperation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateRemoteOperation" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RemoteOperation table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_remote_operation"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_remote_operation" ON __mj."RemoteOperation";

CREATE TRIGGER "trg_update_remote_operation"
BEFORE UPDATE ON __mj."RemoteOperation"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_remote_operation"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operations
-- Item: spDeleteRemoteOperation
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RemoteOperation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRemoteOperation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteRemoteOperation"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."RemoteOperation"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteRemoteOperation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteRemoteOperation" TO "cdp_Integration";
