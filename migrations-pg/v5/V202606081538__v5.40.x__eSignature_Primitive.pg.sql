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

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== DDL: Tables, PKs, Indexes =====================

/* ============================================================================
 eSignature Primitive — Phase 2 Schema
 v5.39.x

 Companion plans: /plans/esignature-primitive.md (design)
 /plans/esignature-build-plan.md (build)

 Creates the six core entities backing the framework eSignature primitive
 (generalized from the app-secure-messaging DocuSign integration). Consuming
 apps link a domain record to a core "MJ: Signature Requests" row via the
 standard polymorphic EntityID / RecordID pair; documents soft-reference
 "MJ: Artifacts" (+ "MJ: Artifact Versions"); credentials live in the
 Credential Engine ("MJ: Credentials"), referenced by SignatureAccount.

 Tables (all new; no destructive changes):
 SignatureProvider — provider-type registry (driver key + capabilities)
 SignatureAccount — per-tenant provider instance (-> Credential)
 SignatureRequest — envelope lifecycle (polymorphic EntityID/RecordID)
 SignatureRequestDocument — documents in an envelope (-> Artifact / ArtifactVersion)
 SignatureRequestRecipient — signers
 SignatureRequestLog — provider-call / webhook audit

 CodeGen convention (per CLAUDE.md migrations guide):
 * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
 * NO foreign-key indexes — CodeGen creates IDX_AUTO_MJ_FKEY_* automatically.
 * sp_addextendedproperty for every non-PK / non-FK column so CodeGen surfaces
 descriptions on regen.
 * Provider rows are seeded via metadata files (metadata/signature-providers/),
 NOT SQL INSERTs.

 Entities themselves (entity metadata, views, spCreate/Update/Delete) are
 produced by CodeGen after this migration runs.
 ============================================================================ */


-- ============================================================================
-- 1. SignatureProvider ("MJ: Signature Providers") — provider-type registry
-- ============================================================================
CREATE TABLE __mj."SignatureProvider" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "ServerDriverKey" VARCHAR(100) NOT NULL,
 "IsActive" BOOLEAN NOT NULL CONSTRAINT DF_SignatureProvider_IsActive DEFAULT TRUE,
 "Priority" INTEGER NOT NULL CONSTRAINT DF_SignatureProvider_Priority DEFAULT 0,
 "RequiresOAuth" BOOLEAN NOT NULL CONSTRAINT DF_SignatureProvider_RequiresOAuth DEFAULT TRUE,
 "SupportsTemplates" BOOLEAN NOT NULL CONSTRAINT DF_SignatureProvider_SupportsTemplates DEFAULT FALSE,
 "SupportsEmbeddedSigning" BOOLEAN NOT NULL CONSTRAINT DF_SignatureProvider_SupportsEmbeddedSigning DEFAULT FALSE,
 "Configuration" TEXT NULL,
 CONSTRAINT PK_SignatureProvider PRIMARY KEY ("ID"),
 CONSTRAINT UQ_SignatureProvider_Name UNIQUE ("Name")
);

CREATE TABLE __mj."SignatureAccount" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "SignatureProviderID" UUID NOT NULL,
 "CredentialID" UUID NOT NULL,
 "CompanyID" UUID NULL,
 "IsActive" BOOLEAN NOT NULL CONSTRAINT DF_SignatureAccount_IsActive DEFAULT TRUE,
 "IsDefault" BOOLEAN NOT NULL CONSTRAINT DF_SignatureAccount_IsDefault DEFAULT FALSE,
 "DefaultFromName" VARCHAR(200) NULL,
 "DefaultFromEmail" VARCHAR(320) NULL,
 "Configuration" TEXT NULL,
 CONSTRAINT PK_SignatureAccount PRIMARY KEY ("ID"),
 CONSTRAINT FK_SignatureAccount_SignatureProvider FOREIGN KEY ("SignatureProviderID")
 REFERENCES __mj."SignatureProvider" ("ID"),
 CONSTRAINT FK_SignatureAccount_Credential FOREIGN KEY ("CredentialID")
 REFERENCES __mj."Credential" ("ID"),
 CONSTRAINT FK_SignatureAccount_Company FOREIGN KEY ("CompanyID")
 REFERENCES __mj."Company" ("ID")
);

CREATE TABLE __mj."SignatureRequest" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SignatureAccountID" UUID NOT NULL,
 "Name" VARCHAR(255) NOT NULL,
 "Message" TEXT NULL,
 "Status" VARCHAR(20) NOT NULL CONSTRAINT DF_SignatureRequest_Status DEFAULT 'Draft',
 "ExternalEnvelopeID" VARCHAR(255) NULL,
 "EntityID" UUID NULL,
 "RecordID" VARCHAR(450) NULL,
 "SentAt" TIMESTAMPTZ NULL,
 "CompletedAt" TIMESTAMPTZ NULL,
 "VoidReason" VARCHAR(500) NULL,
 CONSTRAINT PK_SignatureRequest PRIMARY KEY ("ID"),
 CONSTRAINT FK_SignatureRequest_SignatureAccount FOREIGN KEY ("SignatureAccountID")
 REFERENCES __mj."SignatureAccount" ("ID"),
 CONSTRAINT FK_SignatureRequest_Entity FOREIGN KEY ("EntityID")
 REFERENCES __mj."Entity" ("ID"),
 CONSTRAINT CK_SignatureRequest_Status
 CHECK ("Status" IN ('Draft', 'Sent', 'Delivered', 'Signed', 'Completed', 'Declined', 'Voided'))
);

CREATE TABLE __mj."SignatureRequestDocument" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SignatureRequestID" UUID NOT NULL,
 "ArtifactID" UUID NULL,
 "ArtifactVersionID" UUID NULL,
 "Name" VARCHAR(255) NOT NULL,
 "Sequence" INTEGER NOT NULL CONSTRAINT DF_SignatureRequestDocument_Sequence DEFAULT 1,
 "Role" VARCHAR(20) NOT NULL CONSTRAINT DF_SignatureRequestDocument_Role DEFAULT 'Source',
 CONSTRAINT PK_SignatureRequestDocument PRIMARY KEY ("ID"),
 CONSTRAINT FK_SignatureRequestDocument_SignatureRequest FOREIGN KEY ("SignatureRequestID")
 REFERENCES __mj."SignatureRequest" ("ID"),
 CONSTRAINT FK_SignatureRequestDocument_Artifact FOREIGN KEY ("ArtifactID")
 REFERENCES __mj."Artifact" ("ID"),
 CONSTRAINT FK_SignatureRequestDocument_ArtifactVersion FOREIGN KEY ("ArtifactVersionID")
 REFERENCES __mj."ArtifactVersion" ("ID"),
 CONSTRAINT CK_SignatureRequestDocument_Role
 CHECK ("Role" IN ('Source', 'Signed'))
);

CREATE TABLE __mj."SignatureRequestRecipient" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SignatureRequestID" UUID NOT NULL,
 "Email" VARCHAR(320) NOT NULL,
 "Name" VARCHAR(200) NULL,
 "RoutingOrder" INTEGER NOT NULL CONSTRAINT DF_SignatureRequestRecipient_RoutingOrder DEFAULT 1,
 "Role" VARCHAR(100) NULL,
 "Status" VARCHAR(20) NOT NULL CONSTRAINT DF_SignatureRequestRecipient_Status DEFAULT 'Created',
 "SignedAt" TIMESTAMPTZ NULL,
 "ExternalRecipientID" VARCHAR(255) NULL,
 CONSTRAINT PK_SignatureRequestRecipient PRIMARY KEY ("ID"),
 CONSTRAINT FK_SignatureRequestRecipient_SignatureRequest FOREIGN KEY ("SignatureRequestID")
 REFERENCES __mj."SignatureRequest" ("ID"),
 CONSTRAINT CK_SignatureRequestRecipient_Status
 CHECK ("Status" IN ('Created', 'Sent', 'Delivered', 'Signed', 'Declined'))
);

CREATE TABLE __mj."SignatureRequestLog" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SignatureRequestID" UUID NULL,
 "Operation" VARCHAR(50) NOT NULL,
 "Success" BOOLEAN NOT NULL CONSTRAINT DF_SignatureRequestLog_Success DEFAULT FALSE,
 "StatusBefore" VARCHAR(20) NULL,
 "StatusAfter" VARCHAR(20) NULL,
 "Detail" TEXT NULL,
 CONSTRAINT PK_SignatureRequestLog PRIMARY KEY ("ID"),
 CONSTRAINT FK_SignatureRequestLog_SignatureRequest FOREIGN KEY ("SignatureRequestID")
 REFERENCES __mj."SignatureRequest" ("ID")
);

ALTER TABLE __mj."SignatureRequest"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequest" */
ALTER TABLE __mj."SignatureRequest"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequestDocument" */
ALTER TABLE __mj."SignatureRequestDocument"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequestDocument" */
ALTER TABLE __mj."SignatureRequestDocument"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureAccount" */
ALTER TABLE __mj."SignatureAccount"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureAccount" */
ALTER TABLE __mj."SignatureAccount"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequestRecipient" */
ALTER TABLE __mj."SignatureRequestRecipient"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequestRecipient" */
ALTER TABLE __mj."SignatureRequestRecipient"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureProvider" */
ALTER TABLE __mj."SignatureProvider"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureProvider" */
ALTER TABLE __mj."SignatureProvider"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequestLog" */
ALTER TABLE __mj."SignatureRequestLog"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequestLog" */
ALTER TABLE __mj."SignatureRequestLog"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SignatureAccount_SignatureProviderID" ON __mj."SignatureAccount" ("SignatureProviderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SignatureAccount_CredentialID" ON __mj."SignatureAccount" ("CredentialID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SignatureAccount_CompanyID" ON __mj."SignatureAccount" ("CompanyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SignatureRequestDocument_SignatureRequestID" ON __mj."SignatureRequestDocument" ("SignatureRequestID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SignatureRequestDocument_ArtifactID" ON __mj."SignatureRequestDocument" ("ArtifactID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SignatureRequestDocument_ArtifactVersionID" ON __mj."SignatureRequestDocument" ("ArtifactVersionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SignatureRequestLog_SignatureRequestID" ON __mj."SignatureRequestLog" ("SignatureRequestID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SignatureRequestRecipient_SignatureRequestID" ON __mj."SignatureRequestRecipient" ("SignatureRequestID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SignatureRequest_SignatureAccountID" ON __mj."SignatureRequest" ("SignatureAccountID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SignatureRequest_EntityID" ON __mj."SignatureRequest" ("EntityID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwSignatureAccounts';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSignatureAccounts"
AS SELECT
    s.*,
    "MJSignatureProvider_SignatureProviderID"."Name" AS "SignatureProvider",
    "MJCredential_CredentialID"."Name" AS "Credential",
    "MJCompany_CompanyID"."Name" AS "Company"
FROM
    __mj."SignatureAccount" AS s
INNER JOIN
    __mj."SignatureProvider" AS "MJSignatureProvider_SignatureProviderID"
  ON
    s."SignatureProviderID" = "MJSignatureProvider_SignatureProviderID"."ID"
INNER JOIN
    __mj."Credential" AS "MJCredential_CredentialID"
  ON
    s."CredentialID" = "MJCredential_CredentialID"."ID"
LEFT OUTER JOIN
    __mj."Company" AS "MJCompany_CompanyID"
  ON
    s."CompanyID" = "MJCompany_CompanyID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSignatureProviders';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSignatureProviders"
AS SELECT
    s.*
FROM
    __mj."SignatureProvider" AS s$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSignatureRequestLogs';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSignatureRequestLogs"
AS SELECT
    s.*,
    "MJSignatureRequest_SignatureRequestID"."Name" AS "SignatureRequest"
FROM
    __mj."SignatureRequestLog" AS s
LEFT OUTER JOIN
    __mj."SignatureRequest" AS "MJSignatureRequest_SignatureRequestID"
  ON
    s."SignatureRequestID" = "MJSignatureRequest_SignatureRequestID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSignatureRequestRecipients';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSignatureRequestRecipients"
AS SELECT
    s.*,
    "MJSignatureRequest_SignatureRequestID"."Name" AS "SignatureRequest"
FROM
    __mj."SignatureRequestRecipient" AS s
INNER JOIN
    __mj."SignatureRequest" AS "MJSignatureRequest_SignatureRequestID"
  ON
    s."SignatureRequestID" = "MJSignatureRequest_SignatureRequestID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSignatureRequests';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSignatureRequests"
AS SELECT
    s.*,
    "MJSignatureAccount_SignatureAccountID"."Name" AS "SignatureAccount",
    "MJEntity_EntityID"."Name" AS "Entity"
FROM
    __mj."SignatureRequest" AS s
INNER JOIN
    __mj."SignatureAccount" AS "MJSignatureAccount_SignatureAccountID"
  ON
    s."SignatureAccountID" = "MJSignatureAccount_SignatureAccountID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    s."EntityID" = "MJEntity_EntityID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSignatureRequestDocuments';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSignatureRequestDocuments"
AS SELECT
    s.*,
    "MJSignatureRequest_SignatureRequestID"."Name" AS "SignatureRequest",
    "MJArtifact_ArtifactID"."Name" AS "Artifact",
    "MJArtifactVersion_ArtifactVersionID"."Name" AS "ArtifactVersion"
FROM
    __mj."SignatureRequestDocument" AS s
INNER JOIN
    __mj."SignatureRequest" AS "MJSignatureRequest_SignatureRequestID"
  ON
    s."SignatureRequestID" = "MJSignatureRequest_SignatureRequestID"."ID"
LEFT OUTER JOIN
    __mj."Artifact" AS "MJArtifact_ArtifactID"
  ON
    s."ArtifactID" = "MJArtifact_ArtifactID"."ID"
LEFT OUTER JOIN
    __mj."ArtifactVersion" AS "MJArtifactVersion_ArtifactVersionID"
  ON
    s."ArtifactVersionID" = "MJArtifactVersion_ArtifactVersionID"."ID"$vsql$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateSignatureAccount'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSignatureAccount"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_SignatureProviderID UUID DEFAULT NULL,
    IN p_CredentialID UUID DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_IsDefault BOOLEAN DEFAULT NULL,
    IN p_DefaultFromName_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultFromName VARCHAR(200) DEFAULT NULL,
    IN p_DefaultFromEmail_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultFromEmail VARCHAR(320) DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureAccounts" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SignatureAccount"
            (
                "ID",
                "Name",
                "SignatureProviderID",
                "CredentialID",
                "CompanyID",
                "IsActive",
                "IsDefault",
                "DefaultFromName",
                "DefaultFromEmail",
                "Configuration"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_SignatureProviderID,
                p_CredentialID,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END,
                COALESCE(p_IsActive, TRUE),
                COALESCE(p_IsDefault, FALSE),
                CASE WHEN p_DefaultFromName_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultFromName, NULL) END,
                CASE WHEN p_DefaultFromEmail_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultFromEmail, NULL) END,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SignatureAccount"
            (
                "Name",
                "SignatureProviderID",
                "CredentialID",
                "CompanyID",
                "IsActive",
                "IsDefault",
                "DefaultFromName",
                "DefaultFromEmail",
                "Configuration"
            )
        VALUES
            (
                p_Name,
                p_SignatureProviderID,
                p_CredentialID,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END,
                COALESCE(p_IsActive, TRUE),
                COALESCE(p_IsDefault, FALSE),
                CASE WHEN p_DefaultFromName_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultFromName, NULL) END,
                CASE WHEN p_DefaultFromEmail_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultFromEmail, NULL) END,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSignatureAccounts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSignatureAccount'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSignatureAccount"(
    IN p_ID UUID,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_SignatureProviderID UUID DEFAULT NULL,
    IN p_CredentialID UUID DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_IsDefault BOOLEAN DEFAULT NULL,
    IN p_DefaultFromName_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultFromName VARCHAR(200) DEFAULT NULL,
    IN p_DefaultFromEmail_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultFromEmail VARCHAR(320) DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureAccounts" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SignatureAccount"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "SignatureProviderID" = COALESCE(p_SignatureProviderID, "SignatureProviderID"),
        "CredentialID" = COALESCE(p_CredentialID, "CredentialID"),
        "CompanyID" = CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, "CompanyID") END,
        "IsActive" = COALESCE(p_IsActive, "IsActive"),
        "IsDefault" = COALESCE(p_IsDefault, "IsDefault"),
        "DefaultFromName" = CASE WHEN p_DefaultFromName_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultFromName, "DefaultFromName") END,
        "DefaultFromEmail" = CASE WHEN p_DefaultFromEmail_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultFromEmail, "DefaultFromEmail") END,
        "Configuration" = CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, "Configuration") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSignatureAccounts" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSignatureAccounts" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSignatureAccount'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSignatureAccount"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SignatureAccount"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateSignatureProvider'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSignatureProvider"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_ServerDriverKey VARCHAR(100) DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_RequiresOAuth BOOLEAN DEFAULT NULL,
    IN p_SupportsTemplates BOOLEAN DEFAULT NULL,
    IN p_SupportsEmbeddedSigning BOOLEAN DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureProviders" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SignatureProvider"
            (
                "ID",
                "Name",
                "ServerDriverKey",
                "IsActive",
                "Priority",
                "RequiresOAuth",
                "SupportsTemplates",
                "SupportsEmbeddedSigning",
                "Configuration"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_ServerDriverKey,
                COALESCE(p_IsActive, TRUE),
                COALESCE(p_Priority, 0),
                COALESCE(p_RequiresOAuth, TRUE),
                COALESCE(p_SupportsTemplates, FALSE),
                COALESCE(p_SupportsEmbeddedSigning, FALSE),
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SignatureProvider"
            (
                "Name",
                "ServerDriverKey",
                "IsActive",
                "Priority",
                "RequiresOAuth",
                "SupportsTemplates",
                "SupportsEmbeddedSigning",
                "Configuration"
            )
        VALUES
            (
                p_Name,
                p_ServerDriverKey,
                COALESCE(p_IsActive, TRUE),
                COALESCE(p_Priority, 0),
                COALESCE(p_RequiresOAuth, TRUE),
                COALESCE(p_SupportsTemplates, FALSE),
                COALESCE(p_SupportsEmbeddedSigning, FALSE),
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSignatureProviders" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSignatureProvider'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSignatureProvider"(
    IN p_ID UUID,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_ServerDriverKey VARCHAR(100) DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_RequiresOAuth BOOLEAN DEFAULT NULL,
    IN p_SupportsTemplates BOOLEAN DEFAULT NULL,
    IN p_SupportsEmbeddedSigning BOOLEAN DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureProviders" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SignatureProvider"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "ServerDriverKey" = COALESCE(p_ServerDriverKey, "ServerDriverKey"),
        "IsActive" = COALESCE(p_IsActive, "IsActive"),
        "Priority" = COALESCE(p_Priority, "Priority"),
        "RequiresOAuth" = COALESCE(p_RequiresOAuth, "RequiresOAuth"),
        "SupportsTemplates" = COALESCE(p_SupportsTemplates, "SupportsTemplates"),
        "SupportsEmbeddedSigning" = COALESCE(p_SupportsEmbeddedSigning, "SupportsEmbeddedSigning"),
        "Configuration" = CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, "Configuration") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSignatureProviders" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSignatureProviders" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSignatureProvider'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSignatureProvider"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SignatureProvider"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateSignatureRequestLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSignatureRequestLog"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SignatureRequestID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SignatureRequestID UUID DEFAULT NULL,
    IN p_Operation VARCHAR(50) DEFAULT NULL,
    IN p_Success BOOLEAN DEFAULT NULL,
    IN p_StatusBefore_Clear BOOLEAN DEFAULT FALSE,
    IN p_StatusBefore VARCHAR(20) DEFAULT NULL,
    IN p_StatusAfter_Clear BOOLEAN DEFAULT FALSE,
    IN p_StatusAfter VARCHAR(20) DEFAULT NULL,
    IN p_Detail_Clear BOOLEAN DEFAULT FALSE,
    IN p_Detail TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureRequestLogs" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SignatureRequestLog"
            (
                "ID",
                "SignatureRequestID",
                "Operation",
                "Success",
                "StatusBefore",
                "StatusAfter",
                "Detail"
            )
        VALUES
            (
                p_ID,
                CASE WHEN p_SignatureRequestID_Clear = TRUE THEN NULL ELSE COALESCE(p_SignatureRequestID, NULL) END,
                p_Operation,
                COALESCE(p_Success, FALSE),
                CASE WHEN p_StatusBefore_Clear = TRUE THEN NULL ELSE COALESCE(p_StatusBefore, NULL) END,
                CASE WHEN p_StatusAfter_Clear = TRUE THEN NULL ELSE COALESCE(p_StatusAfter, NULL) END,
                CASE WHEN p_Detail_Clear = TRUE THEN NULL ELSE COALESCE(p_Detail, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SignatureRequestLog"
            (
                "SignatureRequestID",
                "Operation",
                "Success",
                "StatusBefore",
                "StatusAfter",
                "Detail"
            )
        VALUES
            (
                CASE WHEN p_SignatureRequestID_Clear = TRUE THEN NULL ELSE COALESCE(p_SignatureRequestID, NULL) END,
                p_Operation,
                COALESCE(p_Success, FALSE),
                CASE WHEN p_StatusBefore_Clear = TRUE THEN NULL ELSE COALESCE(p_StatusBefore, NULL) END,
                CASE WHEN p_StatusAfter_Clear = TRUE THEN NULL ELSE COALESCE(p_StatusAfter, NULL) END,
                CASE WHEN p_Detail_Clear = TRUE THEN NULL ELSE COALESCE(p_Detail, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSignatureRequestLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSignatureRequestLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSignatureRequestLog"(
    IN p_ID UUID,
    IN p_SignatureRequestID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SignatureRequestID UUID DEFAULT NULL,
    IN p_Operation VARCHAR(50) DEFAULT NULL,
    IN p_Success BOOLEAN DEFAULT NULL,
    IN p_StatusBefore_Clear BOOLEAN DEFAULT FALSE,
    IN p_StatusBefore VARCHAR(20) DEFAULT NULL,
    IN p_StatusAfter_Clear BOOLEAN DEFAULT FALSE,
    IN p_StatusAfter VARCHAR(20) DEFAULT NULL,
    IN p_Detail_Clear BOOLEAN DEFAULT FALSE,
    IN p_Detail TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureRequestLogs" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SignatureRequestLog"
    SET
        "SignatureRequestID" = CASE WHEN p_SignatureRequestID_Clear = TRUE THEN NULL ELSE COALESCE(p_SignatureRequestID, "SignatureRequestID") END,
        "Operation" = COALESCE(p_Operation, "Operation"),
        "Success" = COALESCE(p_Success, "Success"),
        "StatusBefore" = CASE WHEN p_StatusBefore_Clear = TRUE THEN NULL ELSE COALESCE(p_StatusBefore, "StatusBefore") END,
        "StatusAfter" = CASE WHEN p_StatusAfter_Clear = TRUE THEN NULL ELSE COALESCE(p_StatusAfter, "StatusAfter") END,
        "Detail" = CASE WHEN p_Detail_Clear = TRUE THEN NULL ELSE COALESCE(p_Detail, "Detail") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSignatureRequestLogs" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSignatureRequestLogs" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSignatureRequestLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSignatureRequestLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SignatureRequestLog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateSignatureRequestRecipient'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSignatureRequestRecipient"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SignatureRequestID UUID DEFAULT NULL,
    IN p_Email VARCHAR(320) DEFAULT NULL,
    IN p_Name_Clear BOOLEAN DEFAULT FALSE,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_RoutingOrder INTEGER DEFAULT NULL,
    IN p_Role_Clear BOOLEAN DEFAULT FALSE,
    IN p_Role VARCHAR(100) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SignedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_SignedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ExternalRecipientID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalRecipientID VARCHAR(255) DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureRequestRecipients" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SignatureRequestRecipient"
            (
                "ID",
                "SignatureRequestID",
                "Email",
                "Name",
                "RoutingOrder",
                "Role",
                "Status",
                "SignedAt",
                "ExternalRecipientID"
            )
        VALUES
            (
                p_ID,
                p_SignatureRequestID,
                p_Email,
                CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, NULL) END,
                COALESCE(p_RoutingOrder, 1),
                CASE WHEN p_Role_Clear = TRUE THEN NULL ELSE COALESCE(p_Role, NULL) END,
                COALESCE(p_Status, 'Created'),
                CASE WHEN p_SignedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_SignedAt, NULL) END,
                CASE WHEN p_ExternalRecipientID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalRecipientID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SignatureRequestRecipient"
            (
                "SignatureRequestID",
                "Email",
                "Name",
                "RoutingOrder",
                "Role",
                "Status",
                "SignedAt",
                "ExternalRecipientID"
            )
        VALUES
            (
                p_SignatureRequestID,
                p_Email,
                CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, NULL) END,
                COALESCE(p_RoutingOrder, 1),
                CASE WHEN p_Role_Clear = TRUE THEN NULL ELSE COALESCE(p_Role, NULL) END,
                COALESCE(p_Status, 'Created'),
                CASE WHEN p_SignedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_SignedAt, NULL) END,
                CASE WHEN p_ExternalRecipientID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalRecipientID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSignatureRequestRecipients" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSignatureRequestRecipient'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSignatureRequestRecipient"(
    IN p_ID UUID,
    IN p_SignatureRequestID UUID DEFAULT NULL,
    IN p_Email VARCHAR(320) DEFAULT NULL,
    IN p_Name_Clear BOOLEAN DEFAULT FALSE,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_RoutingOrder INTEGER DEFAULT NULL,
    IN p_Role_Clear BOOLEAN DEFAULT FALSE,
    IN p_Role VARCHAR(100) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SignedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_SignedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ExternalRecipientID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalRecipientID VARCHAR(255) DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureRequestRecipients" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SignatureRequestRecipient"
    SET
        "SignatureRequestID" = COALESCE(p_SignatureRequestID, "SignatureRequestID"),
        "Email" = COALESCE(p_Email, "Email"),
        "Name" = CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, "Name") END,
        "RoutingOrder" = COALESCE(p_RoutingOrder, "RoutingOrder"),
        "Role" = CASE WHEN p_Role_Clear = TRUE THEN NULL ELSE COALESCE(p_Role, "Role") END,
        "Status" = COALESCE(p_Status, "Status"),
        "SignedAt" = CASE WHEN p_SignedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_SignedAt, "SignedAt") END,
        "ExternalRecipientID" = CASE WHEN p_ExternalRecipientID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalRecipientID, "ExternalRecipientID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSignatureRequestRecipients" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSignatureRequestRecipients" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSignatureRequestRecipient'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSignatureRequestRecipient"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SignatureRequestRecipient"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateSignatureRequest'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSignatureRequest"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SignatureAccountID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Message_Clear BOOLEAN DEFAULT FALSE,
    IN p_Message TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ExternalEnvelopeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalEnvelopeID VARCHAR(255) DEFAULT NULL,
    IN p_EntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordID VARCHAR(450) DEFAULT NULL,
    IN p_SentAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_SentAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_VoidReason_Clear BOOLEAN DEFAULT FALSE,
    IN p_VoidReason VARCHAR(500) DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureRequests" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SignatureRequest"
            (
                "ID",
                "SignatureAccountID",
                "Name",
                "Message",
                "Status",
                "ExternalEnvelopeID",
                "EntityID",
                "RecordID",
                "SentAt",
                "CompletedAt",
                "VoidReason"
            )
        VALUES
            (
                p_ID,
                p_SignatureAccountID,
                p_Name,
                CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, NULL) END,
                COALESCE(p_Status, 'Draft'),
                CASE WHEN p_ExternalEnvelopeID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalEnvelopeID, NULL) END,
                CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, NULL) END,
                CASE WHEN p_RecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordID, NULL) END,
                CASE WHEN p_SentAt_Clear = TRUE THEN NULL ELSE COALESCE(p_SentAt, NULL) END,
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END,
                CASE WHEN p_VoidReason_Clear = TRUE THEN NULL ELSE COALESCE(p_VoidReason, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SignatureRequest"
            (
                "SignatureAccountID",
                "Name",
                "Message",
                "Status",
                "ExternalEnvelopeID",
                "EntityID",
                "RecordID",
                "SentAt",
                "CompletedAt",
                "VoidReason"
            )
        VALUES
            (
                p_SignatureAccountID,
                p_Name,
                CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, NULL) END,
                COALESCE(p_Status, 'Draft'),
                CASE WHEN p_ExternalEnvelopeID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalEnvelopeID, NULL) END,
                CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, NULL) END,
                CASE WHEN p_RecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordID, NULL) END,
                CASE WHEN p_SentAt_Clear = TRUE THEN NULL ELSE COALESCE(p_SentAt, NULL) END,
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END,
                CASE WHEN p_VoidReason_Clear = TRUE THEN NULL ELSE COALESCE(p_VoidReason, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSignatureRequests" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSignatureRequest'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSignatureRequest"(
    IN p_ID UUID,
    IN p_SignatureAccountID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Message_Clear BOOLEAN DEFAULT FALSE,
    IN p_Message TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ExternalEnvelopeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalEnvelopeID VARCHAR(255) DEFAULT NULL,
    IN p_EntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordID VARCHAR(450) DEFAULT NULL,
    IN p_SentAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_SentAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_VoidReason_Clear BOOLEAN DEFAULT FALSE,
    IN p_VoidReason VARCHAR(500) DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureRequests" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SignatureRequest"
    SET
        "SignatureAccountID" = COALESCE(p_SignatureAccountID, "SignatureAccountID"),
        "Name" = COALESCE(p_Name, "Name"),
        "Message" = CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, "Message") END,
        "Status" = COALESCE(p_Status, "Status"),
        "ExternalEnvelopeID" = CASE WHEN p_ExternalEnvelopeID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalEnvelopeID, "ExternalEnvelopeID") END,
        "EntityID" = CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, "EntityID") END,
        "RecordID" = CASE WHEN p_RecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordID, "RecordID") END,
        "SentAt" = CASE WHEN p_SentAt_Clear = TRUE THEN NULL ELSE COALESCE(p_SentAt, "SentAt") END,
        "CompletedAt" = CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, "CompletedAt") END,
        "VoidReason" = CASE WHEN p_VoidReason_Clear = TRUE THEN NULL ELSE COALESCE(p_VoidReason, "VoidReason") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSignatureRequests" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSignatureRequests" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSignatureRequest'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSignatureRequest"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SignatureRequest"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateSignatureRequestDocument'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSignatureRequestDocument"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SignatureRequestID UUID DEFAULT NULL,
    IN p_ArtifactID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactID UUID DEFAULT NULL,
    IN p_ArtifactVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Role VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureRequestDocuments" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SignatureRequestDocument"
            (
                "ID",
                "SignatureRequestID",
                "ArtifactID",
                "ArtifactVersionID",
                "Name",
                "Sequence",
                "Role"
            )
        VALUES
            (
                p_ID,
                p_SignatureRequestID,
                CASE WHEN p_ArtifactID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactID, NULL) END,
                CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, NULL) END,
                p_Name,
                COALESCE(p_Sequence, 1),
                COALESCE(p_Role, 'Source')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SignatureRequestDocument"
            (
                "SignatureRequestID",
                "ArtifactID",
                "ArtifactVersionID",
                "Name",
                "Sequence",
                "Role"
            )
        VALUES
            (
                p_SignatureRequestID,
                CASE WHEN p_ArtifactID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactID, NULL) END,
                CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, NULL) END,
                p_Name,
                COALESCE(p_Sequence, 1),
                COALESCE(p_Role, 'Source')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSignatureRequestDocuments" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSignatureRequestDocument'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSignatureRequestDocument"(
    IN p_ID UUID,
    IN p_SignatureRequestID UUID DEFAULT NULL,
    IN p_ArtifactID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactID UUID DEFAULT NULL,
    IN p_ArtifactVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Role VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwSignatureRequestDocuments" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SignatureRequestDocument"
    SET
        "SignatureRequestID" = COALESCE(p_SignatureRequestID, "SignatureRequestID"),
        "ArtifactID" = CASE WHEN p_ArtifactID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactID, "ArtifactID") END,
        "ArtifactVersionID" = CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, "ArtifactVersionID") END,
        "Name" = COALESCE(p_Name, "Name"),
        "Sequence" = COALESCE(p_Sequence, "Sequence"),
        "Role" = COALESCE(p_Role, "Role")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSignatureRequestDocuments" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSignatureRequestDocuments" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSignatureRequestDocument'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSignatureRequestDocument"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SignatureRequestDocument"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateSignatureAccount_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSignatureAccount" ON __mj."SignatureAccount";
CREATE TRIGGER "trgUpdateSignatureAccount"
    BEFORE UPDATE ON __mj."SignatureAccount"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSignatureAccount_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSignatureProvider_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSignatureProvider" ON __mj."SignatureProvider";
CREATE TRIGGER "trgUpdateSignatureProvider"
    BEFORE UPDATE ON __mj."SignatureProvider"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSignatureProvider_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSignatureRequestLog_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSignatureRequestLog" ON __mj."SignatureRequestLog";
CREATE TRIGGER "trgUpdateSignatureRequestLog"
    BEFORE UPDATE ON __mj."SignatureRequestLog"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSignatureRequestLog_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSignatureRequestRecipient_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSignatureRequestRecipient" ON __mj."SignatureRequestRecipient";
CREATE TRIGGER "trgUpdateSignatureRequestRecipient"
    BEFORE UPDATE ON __mj."SignatureRequestRecipient"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSignatureRequestRecipient_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSignatureRequest_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSignatureRequest" ON __mj."SignatureRequest";
CREATE TRIGGER "trgUpdateSignatureRequest"
    BEFORE UPDATE ON __mj."SignatureRequest"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSignatureRequest_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSignatureRequestDocument_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSignatureRequestDocument" ON __mj."SignatureRequestDocument";
CREATE TRIGGER "trgUpdateSignatureRequestDocument"
    BEFORE UPDATE ON __mj."SignatureRequestDocument"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSignatureRequestDocument_func"();


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
         '7ee4d69f-16f5-4dc1-9b02-b4af7f8ca8d2',
         'MJ: Signature Providers',
         'Signature Providers',
         NULL,
         NULL,
         'SignatureProvider',
         'vwSignatureProviders',
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

/* SQL generated to add new entity MJ: Signature Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7ee4d69f-16f5-4dc1-9b02-b4af7f8ca8d2', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Providers for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('7ee4d69f-16f5-4dc1-9b02-b4af7f8ca8d2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Providers for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('7ee4d69f-16f5-4dc1-9b02-b4af7f8ca8d2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Providers for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('7ee4d69f-16f5-4dc1-9b02-b4af7f8ca8d2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Signature Accounts */

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
         '43e3f77a-c2b3-4672-a53f-4ff28a0c098b',
         'MJ: Signature Accounts',
         'Signature Accounts',
         NULL,
         NULL,
         'SignatureAccount',
         'vwSignatureAccounts',
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

/* SQL generated to add new entity MJ: Signature Accounts to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '43e3f77a-c2b3-4672-a53f-4ff28a0c098b', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Accounts for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('43e3f77a-c2b3-4672-a53f-4ff28a0c098b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Accounts for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('43e3f77a-c2b3-4672-a53f-4ff28a0c098b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Accounts for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('43e3f77a-c2b3-4672-a53f-4ff28a0c098b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Signature Requests */

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
         'a3b3dfeb-ffca-4f8d-b497-3d2e7fbb02a4',
         'MJ: Signature Requests',
         'Signature Requests',
         NULL,
         NULL,
         'SignatureRequest',
         'vwSignatureRequests',
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

/* SQL generated to add new entity MJ: Signature Requests to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a3b3dfeb-ffca-4f8d-b497-3d2e7fbb02a4', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Requests for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('a3b3dfeb-ffca-4f8d-b497-3d2e7fbb02a4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Requests for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('a3b3dfeb-ffca-4f8d-b497-3d2e7fbb02a4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Requests for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('a3b3dfeb-ffca-4f8d-b497-3d2e7fbb02a4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Signature Request Documents */

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
         '975dff8e-dad8-44b6-9722-4d7b138a213f',
         'MJ: Signature Request Documents',
         'Signature Request Documents',
         NULL,
         NULL,
         'SignatureRequestDocument',
         'vwSignatureRequestDocuments',
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

/* SQL generated to add new entity MJ: Signature Request Documents to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '975dff8e-dad8-44b6-9722-4d7b138a213f', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Request Documents for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('975dff8e-dad8-44b6-9722-4d7b138a213f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Request Documents for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('975dff8e-dad8-44b6-9722-4d7b138a213f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Request Documents for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('975dff8e-dad8-44b6-9722-4d7b138a213f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Signature Request Recipients */

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
         '2eecc44e-a41f-4521-8c0e-764d4d68ff70',
         'MJ: Signature Request Recipients',
         'Signature Request Recipients',
         NULL,
         NULL,
         'SignatureRequestRecipient',
         'vwSignatureRequestRecipients',
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

/* SQL generated to add new entity MJ: Signature Request Recipients to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2eecc44e-a41f-4521-8c0e-764d4d68ff70', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Request Recipients for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('2eecc44e-a41f-4521-8c0e-764d4d68ff70', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Request Recipients for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('2eecc44e-a41f-4521-8c0e-764d4d68ff70', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Request Recipients for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('2eecc44e-a41f-4521-8c0e-764d4d68ff70', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Signature Request Logs */

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
         '224f170c-5fcc-41f2-906f-b82b30f1eb2a',
         'MJ: Signature Request Logs',
         'Signature Request Logs',
         NULL,
         NULL,
         'SignatureRequestLog',
         'vwSignatureRequestLogs',
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

/* SQL generated to add new entity MJ: Signature Request Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '224f170c-5fcc-41f2-906f-b82b30f1eb2a', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Request Logs for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('224f170c-5fcc-41f2-906f-b82b30f1eb2a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Request Logs for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('224f170c-5fcc-41f2-906f-b82b30f1eb2a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Signature Request Logs for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('224f170c-5fcc-41f2-906f-b82b30f1eb2a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequest" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequest" */
UPDATE __mj."SignatureRequest" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequest" */
ALTER TABLE __mj."SignatureRequest" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureRequest"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequest" */
UPDATE __mj."SignatureRequest" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequest" */
ALTER TABLE __mj."SignatureRequest" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureRequest"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequestDocument" */
UPDATE __mj."SignatureRequestDocument" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequestDocument" */
ALTER TABLE __mj."SignatureRequestDocument" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureRequestDocument"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequestDocument" */
UPDATE __mj."SignatureRequestDocument" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequestDocument" */
ALTER TABLE __mj."SignatureRequestDocument" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureRequestDocument"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureAccount" */
UPDATE __mj."SignatureAccount" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureAccount" */
ALTER TABLE __mj."SignatureAccount" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureAccount"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureAccount" */
UPDATE __mj."SignatureAccount" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureAccount" */
ALTER TABLE __mj."SignatureAccount" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureAccount"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequestRecipient" */
UPDATE __mj."SignatureRequestRecipient" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequestRecipient" */
ALTER TABLE __mj."SignatureRequestRecipient" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureRequestRecipient"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequestRecipient" */
UPDATE __mj."SignatureRequestRecipient" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequestRecipient" */
ALTER TABLE __mj."SignatureRequestRecipient" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureRequestRecipient"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureProvider" */
UPDATE __mj."SignatureProvider" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureProvider" */
ALTER TABLE __mj."SignatureProvider" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureProvider"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureProvider" */
UPDATE __mj."SignatureProvider" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureProvider" */
ALTER TABLE __mj."SignatureProvider" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureProvider"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequestLog" */
UPDATE __mj."SignatureRequestLog" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SignatureRequestLog" */
ALTER TABLE __mj."SignatureRequestLog" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureRequestLog"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequestLog" */
UPDATE __mj."SignatureRequestLog" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SignatureRequestLog" */
ALTER TABLE __mj."SignatureRequestLog" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SignatureRequestLog"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e71c719c-20f1-4ede-a4bb-1a05ad3f56b2' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'ID')
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
        "IsComputed",
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
        'e71c719c-20f1-4ede-a4bb-1a05ad3f56b2',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '04a2ede7-1528-48b6-97e0-e7bfcd7c92d5' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'SignatureAccountID')
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
        "IsComputed",
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
        '04a2ede7-1528-48b6-97e0-e7bfcd7c92d5',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100002,
        'SignatureAccountID',
        'Signature Account ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd33a8958-5a04-45ba-9b70-f84881e2cf0c' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'Name')
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
        "IsComputed",
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
        'd33a8958-5a04-45ba-9b70-f84881e2cf0c',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100003,
        'Name',
        'Name',
        'Envelope title / email subject.',
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '875fd874-c53f-41e5-9cdb-2d6468973073' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'Message')
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
        "IsComputed",
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
        '875fd874-c53f-41e5-9cdb-2d6468973073',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100004,
        'Message',
        'Message',
        'Optional email body / message sent to recipients with the envelope.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0da669d4-15fa-4b9a-ab4d-0d2497166089' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'Status')
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
        "IsComputed",
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
        '0da669d4-15fa-4b9a-ab4d-0d2497166089',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100005,
        'Status',
        'Status',
        'Normalized envelope lifecycle status: Draft, Sent, Delivered, Signed, Completed, Declined, or Voided.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Draft',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dac6b9ed-a9b9-4861-8e41-1874cd520be5' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'ExternalEnvelopeID')
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
        "IsComputed",
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
        'dac6b9ed-a9b9-4861-8e41-1874cd520be5',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100006,
        'ExternalEnvelopeID',
        'External Envelope ID',
        'Provider-side envelope identifier (e.g. DocuSign envelopeId), assigned after the envelope is created.',
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b70d9fe2-0f70-4bab-b61e-ac46bc496bf3' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'EntityID')
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
        "IsComputed",
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
        'b70d9fe2-0f70-4bab-b61e-ac46bc496bf3',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100007,
        'EntityID',
        'Entity ID',
        'Polymorphic reference (entity half): the Entity of the originating business record that owns this signature request. NULL for standalone requests. Paired with RecordID.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2fd94d7a-1fa7-44d4-94fb-935431801e0e' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'RecordID')
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
        "IsComputed",
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
        '2fd94d7a-1fa7-44d4-94fb-935431801e0e',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100008,
        'RecordID',
        'Record ID',
        'Polymorphic reference (record half): the primary key value of the originating business record in the entity named by EntityID. NULL for standalone requests.',
        'TEXT',
        900,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4ffe69fd-3d6d-4a6a-8086-b1649c009553' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'SentAt')
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
        "IsComputed",
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
        '4ffe69fd-3d6d-4a6a-8086-b1649c009553',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100009,
        'SentAt',
        'Sent At',
        'Timestamp the envelope was sent to recipients.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8e13825f-dfd5-482b-a4e1-d080c5b1c101' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'CompletedAt')
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
        "IsComputed",
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
        '8e13825f-dfd5-482b-a4e1-d080c5b1c101',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100010,
        'CompletedAt',
        'Completed At',
        'Timestamp the envelope reached a terminal completed state (all recipients signed).',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '947e3ea5-772d-4782-98b9-aeefc2394fa4' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'VoidReason')
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
        "IsComputed",
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
        '947e3ea5-772d-4782-98b9-aeefc2394fa4',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100011,
        'VoidReason',
        'Void Reason',
        'Reason supplied when the envelope was voided/cancelled.',
        'TEXT',
        1000,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '36b6703c-96c3-4156-8502-f47dd0769744' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = '__mj_CreatedAt')
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
        "IsComputed",
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
        '36b6703c-96c3-4156-8502-f47dd0769744',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '64ca6956-b996-497e-bb2b-dc3376c4a704' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = '__mj_UpdatedAt')
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
        "IsComputed",
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
        '64ca6956-b996-497e-bb2b-dc3376c4a704',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dd2b8f16-0b5e-4752-b44b-f332a5530c56' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = 'ID')
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
        "IsComputed",
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
        'dd2b8f16-0b5e-4752-b44b-f332a5530c56',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e0ffc7bb-b143-4930-9ef3-08d5729c9c04' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = 'SignatureRequestID')
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
        "IsComputed",
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
        'e0ffc7bb-b143-4930-9ef3-08d5729c9c04',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
        100002,
        'SignatureRequestID',
        'Signature Request ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c9fc86d8-0586-4b1f-a6b2-6088b02aed06' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = 'ArtifactID')
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
        "IsComputed",
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
        'c9fc86d8-0586-4b1f-a6b2-6088b02aed06',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
        100003,
        'ArtifactID',
        'Artifact ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'F48D2341-8667-40BB-BCA8-87D7F80E16CD',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e308445e-1ac1-42a5-b415-08f5974be589' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = 'ArtifactVersionID')
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
        "IsComputed",
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
        'e308445e-1ac1-42a5-b415-08f5974be589',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
        100004,
        'ArtifactVersionID',
        'Artifact Version ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a206a8d1-db54-49e2-a641-07d0a77a97c4' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = 'Name')
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
        "IsComputed",
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
        'a206a8d1-db54-49e2-a641-07d0a77a97c4',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
        100005,
        'Name',
        'Name',
        'Document filename as presented to the provider / signer.',
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f9283e8e-7a9c-42ab-9d7f-2896b3c1a0f4' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = 'Sequence')
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
        "IsComputed",
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
        'f9283e8e-7a9c-42ab-9d7f-2896b3c1a0f4',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
        100006,
        'Sequence',
        'Sequence',
        'Ordering of this document within the envelope (1-based).',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1a33cac0-8579-4813-8941-80195a300ac5' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = 'Role')
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
        "IsComputed",
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
        '1a33cac0-8579-4813-8941-80195a300ac5',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
        100007,
        'Role',
        'Role',
        'Document role: Source = the document sent for signature; Signed = the executed document downloaded after completion (written back as a new Artifact Version).',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Source',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '598ca112-9604-44a5-b218-79ac441e0dae' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = '__mj_CreatedAt')
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
        "IsComputed",
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
        '598ca112-9604-44a5-b218-79ac441e0dae',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '093b9aac-b391-4ba5-b8fc-26aa0fadbf8c' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = '__mj_UpdatedAt')
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
        "IsComputed",
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
        '093b9aac-b391-4ba5-b8fc-26aa0fadbf8c',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e7b15dc2-cbd6-431b-ab23-be119ee54926' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'ID')
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
        "IsComputed",
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
        'e7b15dc2-cbd6-431b-ab23-be119ee54926',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3bda6373-6ec9-4c18-bd55-17d56b15bfd8' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'Name')
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
        "IsComputed",
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
        '3bda6373-6ec9-4c18-bd55-17d56b15bfd8',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100002,
        'Name',
        'Name',
        'Human-readable account name (e.g. "Acme Prod DocuSign").',
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '40a3f0b5-f4fc-43e0-94ee-bc85ed6af7a5' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'SignatureProviderID')
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
        "IsComputed",
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
        '40a3f0b5-f4fc-43e0-94ee-bc85ed6af7a5',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100003,
        'SignatureProviderID',
        'Signature Provider ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'be88e0af-24a9-4cc8-b3e7-27fabf2ad78b' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'CredentialID')
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
        "IsComputed",
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
        'be88e0af-24a9-4cc8-b3e7-27fabf2ad78b',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100004,
        'CredentialID',
        'Credential ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9b86c37b-47ab-4715-a239-1b072cb79fc1' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'CompanyID')
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
        "IsComputed",
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
        '9b86c37b-47ab-4715-a239-1b072cb79fc1',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100005,
        'CompanyID',
        'Company ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'D4238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fd0b6be9-9152-4d05-aa8a-4186448eb827' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'IsActive')
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
        "IsComputed",
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
        'fd0b6be9-9152-4d05-aa8a-4186448eb827',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100006,
        'IsActive',
        'Is Active',
        'Whether this account is available for use. Inactive accounts are not pre-initialized by the engine driver cache.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5b0443ea-fdd3-4df3-a109-f436741dabb9' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'IsDefault')
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
        "IsComputed",
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
        '5b0443ea-fdd3-4df3-a109-f436741dabb9',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100007,
        'IsDefault',
        'Is Default',
        'Whether this is the default account for its provider (and Company, when scoped).',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '756c442e-c593-4dac-bef8-a494ce2b1902' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'DefaultFromName')
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
        "IsComputed",
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
        '756c442e-c593-4dac-bef8-a494ce2b1902',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100008,
        'DefaultFromName',
        'Default From Name',
        'Default sender display name for envelopes from this account.',
        'TEXT',
        400,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '931be8e0-2ad1-485e-87d3-ed8cb3b41e6f' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'DefaultFromEmail')
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
        "IsComputed",
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
        '931be8e0-2ad1-485e-87d3-ed8cb3b41e6f',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100009,
        'DefaultFromEmail',
        'Default From Email',
        'Default sender email for envelopes from this account.',
        'TEXT',
        640,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b708d886-ef4a-4e60-9e8c-83200bee3939' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'Configuration')
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
        "IsComputed",
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
        'b708d886-ef4a-4e60-9e8c-83200bee3939',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100010,
        'Configuration',
        'Configuration',
        'JSON of non-secret per-account overrides (e.g. accountId, restBase). Merged over provider Configuration and under decrypted credential values at driver initialize().',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e16d1554-36c3-477e-9cd5-524b802191d5' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = '__mj_CreatedAt')
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
        "IsComputed",
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
        'e16d1554-36c3-477e-9cd5-524b802191d5',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100011,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2d9620e6-6074-49b7-98f6-02b347e7f913' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = '__mj_UpdatedAt')
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
        "IsComputed",
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
        '2d9620e6-6074-49b7-98f6-02b347e7f913',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100012,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ec4b6a3c-7d36-4c41-af64-e20a04f2eb68' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = 'ID')
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
        "IsComputed",
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
        'ec4b6a3c-7d36-4c41-af64-e20a04f2eb68',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ff34ff1f-3f9e-4a1b-997b-91bf0e8a628f' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = 'SignatureRequestID')
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
        "IsComputed",
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
        'ff34ff1f-3f9e-4a1b-997b-91bf0e8a628f',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
        100002,
        'SignatureRequestID',
        'Signature Request ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d12d760-f6bb-4eb2-82f4-13f518583d95' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = 'Email')
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
        "IsComputed",
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
        '4d12d760-f6bb-4eb2-82f4-13f518583d95',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
        100003,
        'Email',
        'Email',
        'Recipient email address.',
        'TEXT',
        640,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b87d1bdd-ad99-4c3a-83e4-811a1e389c11' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = 'Name')
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
        "IsComputed",
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
        'b87d1bdd-ad99-4c3a-83e4-811a1e389c11',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
        100004,
        'Name',
        'Name',
        'Recipient display name.',
        'TEXT',
        400,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ee9f7851-6abb-442c-8e43-abcbda31a1aa' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = 'RoutingOrder')
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
        "IsComputed",
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
        'ee9f7851-6abb-442c-8e43-abcbda31a1aa',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
        100005,
        'RoutingOrder',
        'Routing Order',
        'Signing order; lower routes first (1-based).',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4ff77bb5-7e61-449a-a81a-d97daa86b6f5' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = 'Role')
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
        "IsComputed",
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
        '4ff77bb5-7e61-449a-a81a-d97daa86b6f5',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
        100006,
        'Role',
        'Role',
        'Template role name for this recipient, when the envelope was created from a provider template.',
        'TEXT',
        200,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8d1f72d7-6d09-43a4-98cf-e35ba9f08957' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = 'Status')
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
        "IsComputed",
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
        '8d1f72d7-6d09-43a4-98cf-e35ba9f08957',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
        100007,
        'Status',
        'Status',
        'Per-recipient status: Created, Sent, Delivered, Signed, or Declined.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Created',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4552bdca-0879-4a14-b1c0-b50cb5f84dbd' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = 'SignedAt')
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
        "IsComputed",
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
        '4552bdca-0879-4a14-b1c0-b50cb5f84dbd',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
        100008,
        'SignedAt',
        'Signed At',
        'Timestamp this recipient signed.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9dd840b9-bef5-454b-ab7d-6461ec604235' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = 'ExternalRecipientID')
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
        "IsComputed",
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
        '9dd840b9-bef5-454b-ab7d-6461ec604235',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
        100009,
        'ExternalRecipientID',
        'External Recipient ID',
        'Provider-side recipient identifier, for correlation with provider events.',
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6a99a826-45b6-4f2e-bffc-71c30c979f0c' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = '__mj_CreatedAt')
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
        "IsComputed",
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
        '6a99a826-45b6-4f2e-bffc-71c30c979f0c',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
        100010,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '29560860-f17b-4e0d-a317-716f4820c1dd' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = '__mj_UpdatedAt')
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
        "IsComputed",
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
        '29560860-f17b-4e0d-a317-716f4820c1dd',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
        100011,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '73781f9b-7be7-4cc9-9414-c21974ab2a11' OR ("EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND "Name" = 'ID')
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
        "IsComputed",
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
        '73781f9b-7be7-4cc9-9414-c21974ab2a11',
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- "Entity": "MJ": "Signature" "Providers"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c9aaae97-883f-4d9c-814e-183e2463c5f4' OR ("EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND "Name" = 'Name')
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
        "IsComputed",
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
        'c9aaae97-883f-4d9c-814e-183e2463c5f4',
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- "Entity": "MJ": "Signature" "Providers"
        100002,
        'Name',
        'Name',
        'Display name of the eSignature provider type (e.g. DocuSign, Adobe Sign).',
        'TEXT',
        200,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b335e776-2677-405c-beb4-bc435c53afe3' OR ("EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND "Name" = 'ServerDriverKey')
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
        "IsComputed",
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
        'b335e776-2677-405c-beb4-bc435c53afe3',
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- "Entity": "MJ": "Signature" "Providers"
        100003,
        'ServerDriverKey',
        'Server Driver Key',
        'Driver key resolved at runtime via MJGlobal."ClassFactory"."CreateInstance"(BaseSignatureProvider, ServerDriverKey). MUST match the @RegisterClass key on the concrete driver (e.g. ''DocuSign'').',
        'TEXT',
        200,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a845b64d-1d66-4ed6-9ce4-4c7bcae26a8d' OR ("EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND "Name" = 'IsActive')
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
        "IsComputed",
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
        'a845b64d-1d66-4ed6-9ce4-4c7bcae26a8d',
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- "Entity": "MJ": "Signature" "Providers"
        100004,
        'IsActive',
        'Is Active',
        'Whether this provider type is available for use. Inactive providers are skipped by the engine.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1078b446-e3dc-4a7e-8d46-288724b0a8ba' OR ("EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND "Name" = 'Priority')
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
        "IsComputed",
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
        '1078b446-e3dc-4a7e-8d46-288724b0a8ba',
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- "Entity": "MJ": "Signature" "Providers"
        100005,
        'Priority',
        'Priority',
        'Selection priority when multiple providers could apply. Lower number = higher priority.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9659f0dd-ecee-4804-9681-b91b8b215cf2' OR ("EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND "Name" = 'RequiresOAuth')
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
        "IsComputed",
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
        '9659f0dd-ecee-4804-9681-b91b8b215cf2',
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- "Entity": "MJ": "Signature" "Providers"
        100006,
        'RequiresOAuth',
        'Requires O Auth',
        'Whether this provider requires OAuth-based credentials (vs. a static API key).',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c0f7a466-a1e7-4856-ab2b-335756ec44d1' OR ("EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND "Name" = 'SupportsTemplates')
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
        "IsComputed",
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
        'c0f7a466-a1e7-4856-ab2b-335756ec44d1',
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- "Entity": "MJ": "Signature" "Providers"
        100007,
        'SupportsTemplates',
        'Supports Templates',
        'Whether this provider supports creating envelopes from provider-hosted templates (ApplyTemplate operation).',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1bf29a02-9b42-4b60-b13b-8536c42e84e4' OR ("EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND "Name" = 'SupportsEmbeddedSigning')
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
        "IsComputed",
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
        '1bf29a02-9b42-4b60-b13b-8536c42e84e4',
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- "Entity": "MJ": "Signature" "Providers"
        100008,
        'SupportsEmbeddedSigning',
        'Supports Embedded Signing',
        'Whether this provider supports embedded (in-app) signing URLs (CreateEmbeddedSigningUrl operation).',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd27b6ae3-e34b-42dc-9eb5-0b296fc9a934' OR ("EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND "Name" = 'Configuration')
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
        "IsComputed",
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
        'd27b6ae3-e34b-42dc-9eb5-0b296fc9a934',
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- "Entity": "MJ": "Signature" "Providers"
        100009,
        'Configuration',
        'Configuration',
        'JSON of non-secret provider-type defaults (e.g. oauthBase, restBase). Merged under per-account Configuration and decrypted credential values at driver initialize().',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '42db4adb-fb7b-49fb-9406-53931316f62a' OR ("EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND "Name" = '__mj_CreatedAt')
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
        "IsComputed",
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
        '42db4adb-fb7b-49fb-9406-53931316f62a',
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- "Entity": "MJ": "Signature" "Providers"
        100010,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d139b93-4fa1-4d9e-801d-84e55f301a03' OR ("EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND "Name" = '__mj_UpdatedAt')
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
        "IsComputed",
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
        '4d139b93-4fa1-4d9e-801d-84e55f301a03',
        '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- "Entity": "MJ": "Signature" "Providers"
        100011,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '47eacabd-fcb9-4416-b275-763de5377d3d' OR ("EntityID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND "Name" = 'ID')
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
        "IsComputed",
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
        '47eacabd-fcb9-4416-b275-763de5377d3d',
        '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- "Entity": "MJ": "Signature" "Request" "Logs"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '02951200-7a4f-4455-a7e5-81b5c68b58b4' OR ("EntityID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND "Name" = 'SignatureRequestID')
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
        "IsComputed",
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
        '02951200-7a4f-4455-a7e5-81b5c68b58b4',
        '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- "Entity": "MJ": "Signature" "Request" "Logs"
        100002,
        'SignatureRequestID',
        'Signature Request ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b98f7e88-badf-44e7-b02a-79d0de1898ea' OR ("EntityID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND "Name" = 'Operation')
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
        "IsComputed",
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
        'b98f7e88-badf-44e7-b02a-79d0de1898ea',
        '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- "Entity": "MJ": "Signature" "Request" "Logs"
        100003,
        'Operation',
        'Operation',
        'The provider operation logged (e.g. CreateEnvelope, GetEnvelopeStatus, DownloadSignedDocument, VoidEnvelope, Webhook).',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7fbbb1a6-423a-4b6e-8127-490a272a81f2' OR ("EntityID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND "Name" = 'Success')
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
        "IsComputed",
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
        '7fbbb1a6-423a-4b6e-8127-490a272a81f2',
        '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- "Entity": "MJ": "Signature" "Request" "Logs"
        100004,
        'Success',
        'Success',
        'Whether the operation succeeded.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '43ab0872-21f8-4bac-b71a-0f72045df11b' OR ("EntityID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND "Name" = 'StatusBefore')
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
        "IsComputed",
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
        '43ab0872-21f8-4bac-b71a-0f72045df11b',
        '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- "Entity": "MJ": "Signature" "Request" "Logs"
        100005,
        'StatusBefore',
        'Status Before',
        'Signature request status immediately before the operation, when applicable.',
        'TEXT',
        40,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70e5d48f-97fc-4ff4-a427-01e8c9cfcef3' OR ("EntityID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND "Name" = 'StatusAfter')
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
        "IsComputed",
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
        '70e5d48f-97fc-4ff4-a427-01e8c9cfcef3',
        '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- "Entity": "MJ": "Signature" "Request" "Logs"
        100006,
        'StatusAfter',
        'Status After',
        'Signature request status immediately after the operation, when applicable.',
        'TEXT',
        40,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cab58ea9-c662-4a83-b454-f57a4401576b' OR ("EntityID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND "Name" = 'Detail')
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
        "IsComputed",
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
        'cab58ea9-c662-4a83-b454-f57a4401576b',
        '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- "Entity": "MJ": "Signature" "Request" "Logs"
        100007,
        'Detail',
        'Detail',
        'Free-form detail: error text on failure, or normalized event JSON for webhook entries.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ffe370ef-0f9a-47b3-bd54-79d544824832' OR ("EntityID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND "Name" = '__mj_CreatedAt')
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
        "IsComputed",
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
        'ffe370ef-0f9a-47b3-bd54-79d544824832',
        '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- "Entity": "MJ": "Signature" "Request" "Logs"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'baad8f2e-3e8a-4f3d-8833-f88713cd5a5f' OR ("EntityID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND "Name" = '__mj_UpdatedAt')
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
        "IsComputed",
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
        'baad8f2e-3e8a-4f3d-8833-f88713cd5a5f',
        '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- "Entity": "MJ": "Signature" "Request" "Logs"
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
                                       ('ae803047-db7f-49bd-941f-318022832aaf', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 1, 'Completed', 'Completed', NOW(), NOW());

/* SQL text to insert entity field value with ID cdab932a-8c6a-4ee5-ae75-60e138332dc2 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('cdab932a-8c6a-4ee5-ae75-60e138332dc2', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 2, 'Declined', 'Declined', NOW(), NOW());

/* SQL text to insert entity field value with ID e696a16f-2ce3-4c63-a339-2782bc9d3d9b */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e696a16f-2ce3-4c63-a339-2782bc9d3d9b', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 3, 'Delivered', 'Delivered', NOW(), NOW());

/* SQL text to insert entity field value with ID e03dcde2-1635-4290-b15c-f25d9f241768 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e03dcde2-1635-4290-b15c-f25d9f241768', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 4, 'Draft', 'Draft', NOW(), NOW());

/* SQL text to insert entity field value with ID 57cf588d-74a8-4251-9f42-4e60f1e06552 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('57cf588d-74a8-4251-9f42-4e60f1e06552', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 5, 'Sent', 'Sent', NOW(), NOW());

/* SQL text to insert entity field value with ID 377b95e1-0b46-47ab-a1fe-acd6adebf92e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('377b95e1-0b46-47ab-a1fe-acd6adebf92e', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 6, 'Signed', 'Signed', NOW(), NOW());

/* SQL text to insert entity field value with ID a1a99dfb-5bc2-4fc3-8cbe-15eae6ace3d0 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('a1a99dfb-5bc2-4fc3-8cbe-15eae6ace3d0', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 7, 'Voided', 'Voided', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 0DA669D4-15FA-4B9A-AB4D-0D2497166089 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='0DA669D4-15FA-4B9A-AB4D-0D2497166089';

/* SQL text to insert entity field value with ID a9d1e07d-b7ec-4a7e-9f81-23f47a80453f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('a9d1e07d-b7ec-4a7e-9f81-23f47a80453f', '1A33CAC0-8579-4813-8941-80195A300AC5', 1, 'Signed', 'Signed', NOW(), NOW());

/* SQL text to insert entity field value with ID b59520d9-07d7-4c3c-8be2-7ae6d22074d3 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('b59520d9-07d7-4c3c-8be2-7ae6d22074d3', '1A33CAC0-8579-4813-8941-80195A300AC5', 2, 'Source', 'Source', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 1A33CAC0-8579-4813-8941-80195A300AC5 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='1A33CAC0-8579-4813-8941-80195A300AC5';

/* SQL text to insert entity field value with ID 0616403a-5358-4e8f-beea-8275745c27e0 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('0616403a-5358-4e8f-beea-8275745c27e0', '8D1F72D7-6D09-43A4-98CF-E35BA9F08957', 1, 'Created', 'Created', NOW(), NOW());

/* SQL text to insert entity field value with ID 2e5f3565-2c73-4057-b66d-3faa27a7f04e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('2e5f3565-2c73-4057-b66d-3faa27a7f04e', '8D1F72D7-6D09-43A4-98CF-E35BA9F08957', 2, 'Declined', 'Declined', NOW(), NOW());

/* SQL text to insert entity field value with ID ecdf93f2-7b93-428f-8048-f63356fd6ec7 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ecdf93f2-7b93-428f-8048-f63356fd6ec7', '8D1F72D7-6D09-43A4-98CF-E35BA9F08957', 3, 'Delivered', 'Delivered', NOW(), NOW());

/* SQL text to insert entity field value with ID 897395f4-9d4f-4b93-94c3-7a06b5fabd63 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('897395f4-9d4f-4b93-94c3-7a06b5fabd63', '8D1F72D7-6D09-43A4-98CF-E35BA9F08957', 4, 'Sent', 'Sent', NOW(), NOW());

/* SQL text to insert entity field value with ID c9bada35-2cf5-4203-8148-9c53934ada4b */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('c9bada35-2cf5-4203-8148-9c53934ada4b', '8D1F72D7-6D09-43A4-98CF-E35BA9F08957', 5, 'Signed', 'Signed', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 8D1F72D7-6D09-43A4-98CF-E35BA9F08957 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='8D1F72D7-6D09-43A4-98CF-E35BA9F08957';


/* Create Entity Relationship: MJ: Signature Requests -> MJ: Signature Request Logs (One To Many via SignatureRequestID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2cf25380-195c-4a46-9c37-6fe0d51eb6ca'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('2cf25380-195c-4a46-9c37-6fe0d51eb6ca', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', '224F170C-5FCC-41F2-906F-B82B30F1EB2A', 'SignatureRequestID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '1818231f-aac0-4a11-a7b3-2a67ca050125'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('1818231f-aac0-4a11-a7b3-2a67ca050125', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', '2EECC44E-A41F-4521-8C0E-764D4D68FF70', 'SignatureRequestID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '3506256c-bd79-4677-9aff-7ccd17a5d0b9'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('3506256c-bd79-4677-9aff-7ccd17a5d0b9', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', '975DFF8E-DAD8-44B6-9722-4D7B138A213F', 'SignatureRequestID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '29685f42-7fc9-4214-8c87-93f8f29b8f3b'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('29685f42-7fc9-4214-8c87-93f8f29b8f3b', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', 'SignatureAccountID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a5934ae8-3f6b-41d6-81ae-a32313b6256e'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('a5934ae8-3f6b-41d6-81ae-a32313b6256e', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'CompanyID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '697bef3c-7bc6-4248-af61-006040a603fd'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('697bef3c-7bc6-4248-af61-006040a603fd', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', 'EntityID', 'One To Many', TRUE, TRUE, 62, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '52158d8d-bfaf-4a43-a688-d93ddcd59de7'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('52158d8d-bfaf-4a43-a688-d93ddcd59de7', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', '975DFF8E-DAD8-44B6-9722-4D7B138A213F', 'ArtifactID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'df9bea45-2736-4dd5-a039-eb172468ee89'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('df9bea45-2736-4dd5-a039-eb172468ee89', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'CredentialID', 'One To Many', TRUE, TRUE, 8, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f034dcd3-929b-4e91-8c8d-fbe95dd9b1cb'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f034dcd3-929b-4e91-8c8d-fbe95dd9b1cb', '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'SignatureProviderID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2df255ac-d1c5-4b54-9901-602536e53b6d'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('2df255ac-d1c5-4b54-9901-602536e53b6d', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', '975DFF8E-DAD8-44B6-9722-4D7B138A213F', 'ArtifactVersionID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd6b694fe-3781-4744-a329-b5da6551ca69' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'SignatureAccount')
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
        "IsComputed",
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
        'd6b694fe-3781-4744-a329-b5da6551ca69',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100027,
        'SignatureAccount',
        'Signature Account',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c7c4167b-0472-479f-bf34-dcc29d25e5a8' OR ("EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND "Name" = 'Entity')
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
        "IsComputed",
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
        'c7c4167b-0472-479f-bf34-dcc29d25e5a8',
        'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- "Entity": "MJ": "Signature" "Requests"
        100028,
        'Entity',
        'Entity',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e461b212-c8ce-412d-bfbb-ae354bb22816' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = 'SignatureRequest')
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
        "IsComputed",
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
        'e461b212-c8ce-412d-bfbb-ae354bb22816',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
        100019,
        'SignatureRequest',
        'Signature Request',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7ca5248b-60c4-4ca0-b967-94bbe3edc162' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = 'Artifact')
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
        "IsComputed",
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
        '7ca5248b-60c4-4ca0-b967-94bbe3edc162',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
        100020,
        'Artifact',
        'Artifact',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ef3b6f24-3da4-4aad-9720-fefc1bdf9cc4' OR ("EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND "Name" = 'ArtifactVersion')
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
        "IsComputed",
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
        'ef3b6f24-3da4-4aad-9720-fefc1bdf9cc4',
        '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- "Entity": "MJ": "Signature" "Request" "Documents"
        100021,
        'ArtifactVersion',
        'Artifact Version',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '34f399f0-a74c-454a-a64b-385a3e89fc9b' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'SignatureProvider')
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
        "IsComputed",
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
        '34f399f0-a74c-454a-a64b-385a3e89fc9b',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100025,
        'SignatureProvider',
        'Signature Provider',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '10acca90-272e-4424-8c5c-b56ee86ff6ac' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'Credential')
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
        "IsComputed",
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
        '10acca90-272e-4424-8c5c-b56ee86ff6ac',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100026,
        'Credential',
        'Credential',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0d9459ef-1391-48fc-9c12-145fb18d2411' OR ("EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND "Name" = 'Company')
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
        "IsComputed",
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
        '0d9459ef-1391-48fc-9c12-145fb18d2411',
        '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- "Entity": "MJ": "Signature" "Accounts"
        100027,
        'Company',
        'Company',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1f6f1bf1-64de-4330-ab2c-aa161eb9defc' OR ("EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND "Name" = 'SignatureRequest')
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
        "IsComputed",
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
        '1f6f1bf1-64de-4330-ab2c-aa161eb9defc',
        '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- "Entity": "MJ": "Signature" "Request" "Recipients"
        100023,
        'SignatureRequest',
        'Signature Request',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8a6b9f8a-6ed0-4617-9034-67dd097caccf' OR ("EntityID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND "Name" = 'SignatureRequest')
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
        "IsComputed",
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
        '8a6b9f8a-6ed0-4617-9034-67dd097caccf',
        '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- "Entity": "MJ": "Signature" "Request" "Logs"
        100019,
        'SignatureRequest',
        'Signature Request',
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

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A845B64D-1D66-4ED6-9CE4-4C7BCAE26A8D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '1078B446-E3DC-4A7E-8D46-288724B0A8BA'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '9659F0DD-ECEE-4804-9681-B91B8B215CF2'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C0F7A466-A1E7-4856-AB2B-335756EC44D1'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '1BF29A02-9B42-4B60-B13B-8536C42E84E4'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'B335E776-2677-405C-BEB4-BC435C53AFE3'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'C9AAAE97-883F-4D9C-814E-183E2463C5F4'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'B335E776-2677-405C-BEB4-BC435C53AFE3'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F9283E8E-7A9C-42AB-9D7F-2896B3C1A0F4'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '1A33CAC0-8579-4813-8941-80195A300AC5'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E461B212-C8CE-412D-BFBB-AE354BB22816'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '1A33CAC0-8579-4813-8941-80195A300AC5'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'E461B212-C8CE-412D-BFBB-AE354BB22816'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '1A33CAC0-8579-4813-8941-80195A300AC5'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '0DA669D4-15FA-4B9A-AB4D-0D2497166089'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4FFE69FD-3D6D-4A6A-8086-B1649C009553'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '8E13825F-DFD5-482B-A4E1-D080C5B1C101'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D6B694FE-3781-4744-A329-B5DA6551CA69'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'DAC6B9ED-A9B9-4861-8E41-1874CD520BE5'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'DAC6B9ED-A9B9-4861-8E41-1874CD520BE5'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'B98F7E88-BADF-44E7-B02A-79D0DE1898EA'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B98F7E88-BADF-44E7-B02A-79D0DE1898EA'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '7FBBB1A6-423A-4B6E-8127-490A272A81F2'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '43AB0872-21F8-4BAC-B71A-0F72045DF11B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '70E5D48F-97FC-4FF4-A427-01E8C9CFCEF3'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'FFE370EF-0F9A-47B3-BD54-79D544824832'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'B98F7E88-BADF-44E7-B02A-79D0DE1898EA'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '43AB0872-21F8-4BAC-B71A-0F72045DF11B'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '70E5D48F-97FC-4FF4-A427-01E8C9CFCEF3'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'B98F7E88-BADF-44E7-B02A-79D0DE1898EA'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '43AB0872-21F8-4BAC-B71A-0F72045DF11B'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '70E5D48F-97FC-4FF4-A427-01E8C9CFCEF3'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '4D12D760-F6BB-4EB2-82F4-13F518583D95'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4D12D760-F6BB-4EB2-82F4-13F518583D95'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'EE9F7851-6ABB-442C-8E43-ABCBDA31A1AA'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4FF77BB5-7E61-449A-A81A-D97DAA86B6F5'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '8D1F72D7-6D09-43A4-98CF-E35BA9F08957'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '4D12D760-F6BB-4EB2-82F4-13F518583D95'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '4FF77BB5-7E61-449A-A81A-D97DAA86B6F5'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '4D12D760-F6BB-4EB2-82F4-13F518583D95'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '4FF77BB5-7E61-449A-A81A-D97DAA86B6F5'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'FD0B6BE9-9152-4D05-AA8A-4186448EB827'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5B0443EA-FDD3-4DF3-A109-F436741DABB9'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '931BE8E0-2AD1-485E-87D3-ED8CB3B41E6F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '34F399F0-A74C-454A-A64B-385A3E89FC9B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '756C442E-C593-4DAC-BEF8-A494CE2B1902'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '931BE8E0-2AD1-485E-87D3-ED8CB3B41E6F'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '34F399F0-A74C-454A-A64B-385A3E89FC9B'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '3BDA6373-6EC9-4C18-BD55-17D56B15BFD8'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '34F399F0-A74C-454A-A64B-385A3E89FC9B'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '931BE8E0-2AD1-485E-87D3-ED8CB3B41E6F'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Signature Providers."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '73781F9B-7BE7-4CC9-9414-C21974AB2A11' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Providers."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C9AAAE97-883F-4D9C-814E-183E2463C5F4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Providers."ServerDriverKey"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B335E776-2677-405C-BEB4-BC435C53AFE3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Providers."IsActive"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A845B64D-1D66-4ED6-9CE4-4C7BCAE26A8D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Providers."Priority"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1078B446-E3DC-4A7E-8D46-288724B0A8BA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Providers."RequiresOAuth"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Capabilities and Security',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Requires OAuth',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9659F0DD-ECEE-4804-9681-B91B8B215CF2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Providers."SupportsTemplates"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Capabilities and Security',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C0F7A466-A1E7-4856-AB2B-335756EC44D1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Providers."SupportsEmbeddedSigning"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Capabilities and Security',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1BF29A02-9B42-4B60-B13B-8536C42E84E4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Providers."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Capabilities and Security',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'D27B6AE3-E34B-42DC-9EB5-0B296FC9A934' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Providers.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '42DB4ADB-FB7B-49FB-9406-53931316F62A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Providers.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D139B93-4FA1-4D9E-801D-84E55F301A03' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Signature Request Logs."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '47EACABD-FCB9-4416-B275-763DE5377D3D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs."SignatureRequestID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Signature Request',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '02951200-7A4F-4455-A7E5-81B5C68B58B4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs."SignatureRequest"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Signature Request Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8A6B9F8A-6ED0-4617-9034-67DD097CACCF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs."Operation"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Operation Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B98F7E88-BADF-44E7-B02A-79D0DE1898EA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs."Success"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Operation Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7FBBB1A6-423A-4B6E-8127-490A272A81F2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs."StatusBefore"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Status Tracking',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '43AB0872-21F8-4BAC-B71A-0F72045DF11B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs."StatusAfter"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Status Tracking',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '70E5D48F-97FC-4FF4-A427-01E8C9CFCEF3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs."Detail"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Operation Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'CAB58EA9-C662-4A83-B454-F57A4401576B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FFE370EF-0F9A-47B3-BD54-79D544824832' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BAAD8F2E-3E8A-4F3D-8833-F88713CD5A5F' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-file-signature */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-file-signature', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A';

/* Set entity icon to fa fa-signature */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-signature', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('1c9eb987-5000-4f9c-ba46-4b809c1d7c4e', '224F170C-5FCC-41F2-906F-B82B30F1EB2A', 'FieldCategoryInfo', '{"Request Context":{"icon":"fa fa-file-signature","description":"Links the log entry to the specific signature request"},"Operation Details":{"icon":"fa fa-cogs","description":"Information about the specific operation performed and its outcome"},"Status Tracking":{"icon":"fa fa-exchange-alt","description":"Tracks state changes before and after the operation"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('84551335-11b4-4f25-ad97-91e9ac61af41', '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', 'FieldCategoryInfo', '{"Provider Configuration":{"icon":"fa fa-sliders-h","description":"Core identification, activation, and operational settings for the signature provider."},"Capabilities and Security":{"icon":"fa fa-shield-alt","description":"Functional capabilities, authentication requirements, and technical configuration parameters."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('aba268f4-dadd-4416-93c5-48d55d47ec14', '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', 'FieldCategoryIcons', '{"Provider Configuration":"fa fa-sliders-h","Capabilities and Security":"fa fa-shield-alt","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('efc38dc7-29f1-4ba5-bd03-a8da92149f29', '224F170C-5FCC-41F2-906F-B82B30F1EB2A', 'FieldCategoryIcons', '{"Request Context":"fa fa-file-signature","Operation Details":"fa fa-cogs","Status Tracking":"fa fa-exchange-alt","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2';

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '224F170C-5FCC-41F2-906F-B82B30F1EB2A';

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Signature Request Documents."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DD2B8F16-0B5E-4752-B44B-F332A5530C56' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents."SignatureRequestID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Document Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Signature Request',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E0FFC7BB-B143-4930-9EF3-08D5729C9C04' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents."SignatureRequest"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Document Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Signature Request Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E461B212-C8CE-412D-BFBB-AE354BB22816' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents."ArtifactID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Document Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Artifact',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C9FC86D8-0586-4B1F-A6B2-6088B02AED06' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents."Artifact"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Document Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Artifact Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7CA5248B-60C4-4CA0-B967-94BBE3EDC162' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents."ArtifactVersionID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Document Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Artifact Version',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E308445E-1AC1-42A5-B415-08F5974BE589' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents."ArtifactVersion"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Document Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Artifact Version Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EF3B6F24-3DA4-4AAD-9720-FEFC1BDF9CC4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Document Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Document Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A206A8D1-DB54-49E2-A641-07D0A77A97C4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents."Sequence"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Document Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F9283E8E-7A9C-42AB-9D7F-2896B3C1A0F4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents."Role"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Document Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Document Role',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1A33CAC0-8579-4813-8941-80195A300AC5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '598CA112-9604-44A5-B218-79AC441E0DAE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '093B9AAC-B391-4BA5-B8FC-26AA0FADBF8C' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-file-signature */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-file-signature', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('654eac24-728a-4739-b5ad-a20f88f3f77e', '975DFF8E-DAD8-44B6-9722-4D7B138A213F', 'FieldCategoryInfo', '{"Document Context":{"icon":"fa fa-link","description":"Links to parent signature requests and related document artifacts"},"Document Details":{"icon":"fa fa-file-alt","description":"Configuration details for the document including naming, ordering, and usage role"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('0aec54c8-c3a7-410f-abb9-4783a0d172b2', '975DFF8E-DAD8-44B6-9722-4D7B138A213F', 'FieldCategoryIcons', '{"Document Context":"fa fa-link","Document Details":"fa fa-file-alt","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '975DFF8E-DAD8-44B6-9722-4D7B138A213F';

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EC4B6A3C-7D36-4C41-AF64-E20A04F2EB68' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients."SignatureRequestID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Association',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FF34FF1F-3F9E-4A1B-997B-91BF0E8A628F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients."SignatureRequest"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Association',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1F6F1BF1-64DE-4330-AB2C-AA161EB9DEFC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients."Email"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Recipient Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Email',
   "CodeType" = NULL
WHERE 
   "ID" = '4D12D760-F6BB-4EB2-82F4-13F518583D95' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Recipient Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B87D1BDD-AD99-4C3A-83E4-811A1E389C11' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients."Role"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Recipient Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4FF77BB5-7E61-449A-A81A-D97DAA86B6F5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients."RoutingOrder"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Workflow Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EE9F7851-6ABB-442C-8E43-ABCBDA31A1AA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Workflow Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8D1F72D7-6D09-43A4-98CF-E35BA9F08957' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients."SignedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Workflow Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4552BDCA-0879-4A14-B1C0-B50CB5F84DBD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients."ExternalRecipientID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Workflow Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9DD840B9-BEF5-454B-AB7D-6461EC604235' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6A99A826-45B6-4F2E-BFFC-71C30C979F0C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '29560860-F17B-4E0D-A317-716F4820C1DD' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-envelope-open-text */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-envelope-open-text', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('9a98f354-b7b4-4ddb-9eb4-a37e150fceeb', '2EECC44E-A41F-4521-8C0E-764D4D68FF70', 'FieldCategoryInfo', '{"Recipient Information":{"icon":"fa fa-user","description":"Basic contact details and assigned roles for the recipient"},"Workflow Settings":{"icon":"fa fa-tasks","description":"Signing order, status tracking, and provider integration details"},"Request Association":{"icon":"fa fa-link","description":"Linkages to the parent signature request entity"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('adb8153d-36df-4e4c-aaa7-64b14b271f42', '2EECC44E-A41F-4521-8C0E-764D4D68FF70', 'FieldCategoryIcons', '{"Recipient Information":"fa fa-user","Workflow Settings":"fa fa-tasks","Request Association":"fa fa-link","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '2EECC44E-A41F-4521-8C0E-764D4D68FF70';

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Signature Requests."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E71C719C-20F1-4EDE-A4BB-1A05AD3F56B2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."SignatureAccountID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '04A2EDE7-1528-48B6-97E0-E7BFCD7C92D5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."SignatureAccount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D6B694FE-3781-4744-A329-B5DA6551CA69' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D33A8958-5A04-45BA-9B70-F84881E2CF0C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."Message"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '875FD874-C53F-41E5-9CDB-2D6468973073' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0DA669D4-15FA-4B9A-AB4D-0D2497166089' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."ExternalEnvelopeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DAC6B9ED-A9B9-4861-8E41-1874CD520BE5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."VoidReason"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '947E3EA5-772D-4782-98B9-AEEFC2394FA4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."EntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Related Records',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B70D9FE2-0F70-4BAB-B61E-AC46BC496BF3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."Entity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Related Records',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C7C4167B-0472-479F-BF34-DCC29D25E5A8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."RecordID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Related Records',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2FD94D7A-1FA7-44D4-94FB-935431801E0E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."SentAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Timeline',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4FFE69FD-3D6D-4A6A-8086-B1649C009553' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests."CompletedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Timeline',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8E13825F-DFD5-482B-A4E1-D080C5B1C101' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '36B6703C-96C3-4156-8502-F47DD0769744' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Requests.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '64CA6956-B996-497E-BB2B-DC3376C4A704' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-file-signature */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-file-signature', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('3099f3fa-c903-4ac0-9c1d-552991834fd6', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', 'FieldCategoryInfo', '{"Request Details":{"icon":"fa fa-info-circle","description":"Core information about the signature request and account"},"Request Status":{"icon":"fa fa-tasks","description":"Lifecycle status and external provider tracking information"},"Related Records":{"icon":"fa fa-link","description":"Links to the originating business records"},"Timeline":{"icon":"fa fa-clock","description":"Key event timestamps for the request lifecycle"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('4c60fbb5-8595-49cb-af53-1018240f01d9', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', 'FieldCategoryIcons', '{"Request Details":"fa fa-info-circle","Request Status":"fa fa-tasks","Related Records":"fa fa-link","Timeline":"fa fa-clock","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4';

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Signature Accounts."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E7B15DC2-CBD6-431B-AB23-BE119EE54926' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3BDA6373-6EC9-4C18-BD55-17D56B15BFD8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."SignatureProviderID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Signature Provider',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '40A3F0B5-F4FC-43E0-94EE-BC85ED6AF7A5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."CredentialID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Credential',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BE88E0AF-24A9-4CC8-B3E7-27FABF2AD78B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."CompanyID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Company',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9B86C37B-47AB-4715-A239-1B072CB79FC1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."IsActive"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD0B6BE9-9152-4D05-AA8A-4186448EB827' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."IsDefault"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5B0443EA-FDD3-4DF3-A109-F436741DABB9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."DefaultFromName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sender Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '756C442E-C593-4DAC-BEF8-A494CE2B1902' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."DefaultFromEmail"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sender Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Email',
   "CodeType" = NULL
WHERE 
   "ID" = '931BE8E0-2AD1-485E-87D3-ED8CB3B41E6F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'B708D886-EF4A-4E60-9E8C-83200BEE3939' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."SignatureProvider"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Signature Provider Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '34F399F0-A74C-454A-A64B-385A3E89FC9B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."Credential"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Credential Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '10ACCA90-272E-4424-8C5C-B56EE86FF6AC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts."Company"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Account Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Company Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0D9459EF-1391-48FC-9C12-145FB18D2411' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E16D1554-36C3-477E-9CD5-524B802191D5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2D9620E6-6074-49B7-98F6-02B347E7F913' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-file-signature */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-file-signature', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('b75d6f57-f87f-423a-8d14-9496210c0b0d', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'FieldCategoryInfo', '{"Account Details":{"icon":"fa fa-info-circle","description":"Basic identification and naming information for the signature account."},"Account Configuration":{"icon":"fa fa-cogs","description":"Technical settings, provider links, and JSON configuration overrides."},"Account Status":{"icon":"fa fa-check-circle","description":"Operational status and default settings for the account."},"Sender Settings":{"icon":"fa fa-envelope","description":"Default identity information used when sending envelopes."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields."}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('2d497758-0a56-4611-aac0-c5ea9f8f2260', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'FieldCategoryIcons', '{"Account Details":"fa fa-info-circle","Account Configuration":"fa fa-cogs","Account Status":"fa fa-check-circle","Sender Settings":"fa fa-envelope","System Metadata":"fa fa-database"}', NOW(), NOW());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B';


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureAccounts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Signature Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Accounts
-- Item: Permissions for vwSignatureAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureAccounts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Signature Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Accounts
-- Item: spCreateSignatureAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureAccount
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Signature Accounts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Signature Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Accounts
-- Item: spUpdateSignatureAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureAccount
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Signature Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Accounts
-- Item: spDeleteSignatureAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureAccount
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Signature Accounts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for SignatureProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for SignatureRequestDocument */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SignatureRequestID in table SignatureRequestDocument;

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureProviders" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Signature Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Providers
-- Item: Permissions for vwSignatureProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureProviders" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Signature Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Providers
-- Item: spCreateSignatureProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Signature Providers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Signature Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Providers
-- Item: spUpdateSignatureProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Signature Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Providers
-- Item: spDeleteSignatureProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Signature Providers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Signature Request Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Logs
-- Item: vwSignatureRequestLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Signature Request Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  SignatureRequestLog
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureRequestLogs" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Signature Request Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Logs
-- Item: Permissions for vwSignatureRequestLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureRequestLogs" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Signature Request Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Logs
-- Item: spCreateSignatureRequestLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureRequestLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureRequestLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Signature Request Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureRequestLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Signature Request Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Logs
-- Item: spUpdateSignatureRequestLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureRequestLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureRequestLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureRequestLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Signature Request Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Logs
-- Item: spDeleteSignatureRequestLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureRequestLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureRequestLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Signature Request Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureRequestLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID C9FC86D8-0586-4B1F-A6B2-6088B02AED06 */

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureRequestRecipients" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Signature Request Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Recipients
-- Item: Permissions for vwSignatureRequestRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureRequestRecipients" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Signature Request Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Recipients
-- Item: spCreateSignatureRequestRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureRequestRecipient
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureRequestRecipient" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Signature Request Recipients */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureRequestRecipient" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Signature Request Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Recipients
-- Item: spUpdateSignatureRequestRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureRequestRecipient
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureRequestRecipient" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureRequestRecipient" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Signature Request Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Recipients
-- Item: spDeleteSignatureRequestRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureRequestRecipient
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureRequestRecipient" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Signature Request Recipients */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureRequestRecipient" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID E308445E-1AC1-42A5-B415-08F5974BE589 */

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureRequests" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Signature Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Requests
-- Item: Permissions for vwSignatureRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureRequests" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Signature Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Requests
-- Item: spCreateSignatureRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Signature Requests */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Signature Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Requests
-- Item: spUpdateSignatureRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Signature Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Requests
-- Item: spDeleteSignatureRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Signature Requests */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Signature Request Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: vwSignatureRequestDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Signature Request Documents
-----               SCHEMA:      __mj
-----               BASE TABLE:  SignatureRequestDocument
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureRequestDocuments" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Signature Request Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: Permissions for vwSignatureRequestDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSignatureRequestDocuments" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Signature Request Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: spCreateSignatureRequestDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureRequestDocument
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureRequestDocument" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Signature Request Documents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSignatureRequestDocument" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Signature Request Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: spUpdateSignatureRequestDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureRequestDocument
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureRequestDocument" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSignatureRequestDocument" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Signature Request Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: spDeleteSignatureRequestDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureRequestDocument
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureRequestDocument" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Signature Request Documents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSignatureRequestDocument" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."SignatureProvider"."Name" IS 'Display name of the eSignature provider type (e.g. DocuSign, Adobe Sign).';

COMMENT ON COLUMN __mj."SignatureProvider"."ServerDriverKey" IS 'Driver key resolved at runtime via MJGlobal."ClassFactory"."CreateInstance"(BaseSignatureProvider, ServerDriverKey). MUST match the @RegisterClass key on the concrete driver (e.g. ';

COMMENT ON COLUMN __mj."SignatureProvider"."IsActive" IS 'Whether this provider type is available for use. Inactive providers are skipped by the engine.';

COMMENT ON COLUMN __mj."SignatureProvider"."Priority" IS 'Selection priority when multiple providers could apply. Lower number = higher priority.';

COMMENT ON COLUMN __mj."SignatureProvider"."RequiresOAuth" IS 'Whether this provider requires OAuth-based credentials (vs. a static API key).';

COMMENT ON COLUMN __mj."SignatureProvider"."SupportsTemplates" IS 'Whether this provider supports creating envelopes from provider-hosted templates (ApplyTemplate operation).';

COMMENT ON COLUMN __mj."SignatureProvider"."SupportsEmbeddedSigning" IS 'Whether this provider supports embedded (in-app) signing URLs (CreateEmbeddedSigningUrl operation).';

COMMENT ON COLUMN __mj."SignatureProvider"."Configuration" IS 'JSON of non-secret provider-type defaults (e.g. oauthBase, restBase). Merged under per-account Configuration and decrypted credential values at driver initialize().';

COMMENT ON COLUMN __mj."SignatureAccount"."Name" IS 'Human-readable account name (e.g. "Acme Prod DocuSign").';

COMMENT ON COLUMN __mj."SignatureAccount"."IsActive" IS 'Whether this account is available for use. Inactive accounts are not pre-initialized by the engine driver cache.';

COMMENT ON COLUMN __mj."SignatureAccount"."IsDefault" IS 'Whether this is the default account for its provider (and Company, when scoped).';

COMMENT ON COLUMN __mj."SignatureAccount"."DefaultFromName" IS 'Default sender display name for envelopes from this account.';

COMMENT ON COLUMN __mj."SignatureAccount"."DefaultFromEmail" IS 'Default sender email for envelopes from this account.';

COMMENT ON COLUMN __mj."SignatureAccount"."Configuration" IS 'JSON of non-secret per-account overrides (e.g. accountId, restBase). Merged over provider Configuration and under decrypted credential values at driver initialize().';

COMMENT ON COLUMN __mj."SignatureRequest"."Name" IS 'Envelope title / email subject.';

COMMENT ON COLUMN __mj."SignatureRequest"."Message" IS 'Optional email body / message sent to recipients with the envelope.';

COMMENT ON COLUMN __mj."SignatureRequest"."Status" IS 'Normalized envelope lifecycle status: Draft, Sent, Delivered, Signed, Completed, Declined, or Voided.';

COMMENT ON COLUMN __mj."SignatureRequest"."ExternalEnvelopeID" IS 'Provider-side envelope identifier (e.g. DocuSign envelopeId), assigned after the envelope is created.';

COMMENT ON COLUMN __mj."SignatureRequest"."EntityID" IS 'Polymorphic reference (entity half): the Entity of the originating business record that owns this signature request. NULL for standalone requests. Paired with RecordID.';

COMMENT ON COLUMN __mj."SignatureRequest"."RecordID" IS 'Polymorphic reference (record half): the primary key value of the originating business record in the entity named by EntityID. NULL for standalone requests.';

COMMENT ON COLUMN __mj."SignatureRequest"."SentAt" IS 'Timestamp the envelope was sent to recipients.';

COMMENT ON COLUMN __mj."SignatureRequest"."CompletedAt" IS 'Timestamp the envelope reached a terminal completed state (all recipients signed).';

COMMENT ON COLUMN __mj."SignatureRequest"."VoidReason" IS 'Reason supplied when the envelope was voided/cancelled.';

COMMENT ON COLUMN __mj."SignatureRequestDocument"."Name" IS 'Document filename as presented to the provider / signer.';

COMMENT ON COLUMN __mj."SignatureRequestDocument"."Sequence" IS 'Ordering of this document within the envelope (1-based).';

COMMENT ON COLUMN __mj."SignatureRequestDocument"."Role" IS 'Document role: Source = the document sent for signature; Signed = the executed document downloaded after completion (written back as a new Artifact Version).';

COMMENT ON COLUMN __mj."SignatureRequestRecipient"."Email" IS 'Recipient email address.';

COMMENT ON COLUMN __mj."SignatureRequestRecipient"."Name" IS 'Recipient display name.';

COMMENT ON COLUMN __mj."SignatureRequestRecipient"."RoutingOrder" IS 'Signing order; lower routes first (1-based).';

COMMENT ON COLUMN __mj."SignatureRequestRecipient"."Role" IS 'Template role name for this recipient, when the envelope was created from a provider template.';

COMMENT ON COLUMN __mj."SignatureRequestRecipient"."Status" IS 'Per-recipient status: Created, Sent, Delivered, Signed, or Declined.';

COMMENT ON COLUMN __mj."SignatureRequestRecipient"."SignedAt" IS 'Timestamp this recipient signed.';

COMMENT ON COLUMN __mj."SignatureRequestRecipient"."ExternalRecipientID" IS 'Provider-side recipient identifier, for correlation with provider events.';

COMMENT ON COLUMN __mj."SignatureRequestLog"."Operation" IS 'The provider operation logged (e.g. CreateEnvelope, GetEnvelopeStatus, DownloadSignedDocument, VoidEnvelope, Webhook).';

COMMENT ON COLUMN __mj."SignatureRequestLog"."Success" IS 'Whether the operation succeeded.';

COMMENT ON COLUMN __mj."SignatureRequestLog"."StatusBefore" IS 'Signature request status immediately before the operation, when applicable.';

COMMENT ON COLUMN __mj."SignatureRequestLog"."StatusAfter" IS 'Signature request status immediately after the operation, when applicable.';

COMMENT ON COLUMN __mj."SignatureRequestLog"."Detail" IS 'Free-form detail: error text on failure, or normalized event JSON for webhook entries.';


-- ===================== Other =====================

/*--------------------------CODEGEN------------------------------*/
/* SQL generated to create new entity MJ: Signature Providers */

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Signature Accounts */

/* spUpdate Permissions for MJ: Signature Providers */

/* spUpdate Permissions for MJ: Signature Request Logs */

/* spUpdate Permissions for MJ: Signature Request Recipients */

/* spUpdate Permissions for MJ: Signature Requests */

/* spUpdate Permissions for MJ: Signature Request Documents */
