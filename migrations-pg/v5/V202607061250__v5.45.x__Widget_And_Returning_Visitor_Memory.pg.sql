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

CREATE TABLE __mj."ConversationWidgetInstance" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(255) NOT NULL,
 "PublicKey" VARCHAR(100) NOT NULL,
 "ApplicationID" UUID NOT NULL,
 "PinnedAgentID" UUID NOT NULL,
 "GuestRoleID" UUID NOT NULL,
 "AllowedOrigins" TEXT NULL,
 "Modality" VARCHAR(10) NOT NULL DEFAULT 'Text',
 "AuthStrategy" VARCHAR(20) NOT NULL DEFAULT 'Anonymous',
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 "SessionTTLMinutes" INTEGER NOT NULL DEFAULT 15,
 "RateLimitPerMinute" INTEGER NOT NULL DEFAULT 30,
 "VoiceMaxSessionMinutes" INTEGER NULL,
 "EnabledChannels" TEXT NULL,
 "HostPublicKey" TEXT NULL,
 "RememberReturningVisitors" BOOLEAN NOT NULL DEFAULT FALSE,
 "VisitorMemoryRetentionDays" INTEGER NULL,
 CONSTRAINT PK_ConversationWidgetInstance PRIMARY KEY ("ID"),
 CONSTRAINT UQ_ConversationWidgetInstance_PublicKey UNIQUE ("PublicKey"),
 CONSTRAINT FK_ConversationWidgetInstance_Application FOREIGN KEY ("ApplicationID")
 REFERENCES __mj."Application"("ID"),
 CONSTRAINT FK_ConversationWidgetInstance_PinnedAgent FOREIGN KEY ("PinnedAgentID")
 REFERENCES __mj."AIAgent"("ID"),
 CONSTRAINT FK_ConversationWidgetInstance_GuestRole FOREIGN KEY ("GuestRoleID")
 REFERENCES __mj."Role"("ID"),
 CONSTRAINT CK_ConversationWidgetInstance_Modality
 CHECK ("Modality" IN ('Text', 'Voice', 'Both')),
 CONSTRAINT CK_ConversationWidgetInstance_AuthStrategy
 CHECK ("AuthStrategy" IN ('Anonymous', 'MagicLinkUpgrade', 'HostIdentity')),
 CONSTRAINT CK_ConversationWidgetInstance_Status
 CHECK ("Status" IN ('Active', 'Disabled')),
 CONSTRAINT CK_ConversationWidgetInstance_SessionTTLMinutes
 CHECK ("SessionTTLMinutes" > 0 AND "SessionTTLMinutes" <= 1440),
 CONSTRAINT CK_ConversationWidgetInstance_RateLimitPerMinute
 CHECK ("RateLimitPerMinute" > 0),
 CONSTRAINT CK_ConversationWidgetInstance_VisitorMemoryRetentionDays
 CHECK ("VisitorMemoryRetentionDays" > 0)
);


-- =============================================================================
-- 2. Returning-visitor continuity on Conversation
-- =============================================================================
-- VisitorKey = durable anonymous anchor (R3).
-- LastConversationID = the visitor's immediately-prior conversation (R2), named to
-- mirror AIAgentSession.LastSessionID. The RESOLVED counterparty identity is NOT a
-- new pair here — it reuses the existing LinkedEntityID / LinkedRecordID polymorphic
-- pair (baseline v5.38, governed by CK_Conversation_LinkBinding).;

ALTER TABLE __mj."Conversation"
 ADD COLUMN IF NOT EXISTS "VisitorKey"         VARCHAR(255) NULL,
 ADD COLUMN IF NOT EXISTS "LastConversationID" UUID NULL,
 ADD CONSTRAINT "FK_Conversation_LastConversation"
        FOREIGN KEY ("LastConversationID") REFERENCES __mj."Conversation"("ID") DEFERRABLE INITIALLY DEFERRED;


-- =============================================================================
-- 3. Polymorphic counterparty identity on AIAgentSession
-- =============================================================================
-- Mirrors the Conversation linked pair so a realtime session can carry its
-- counterparty identity directly. LinkedRecordID is VARCHAR(500), NOT FK-constrained
-- (points at any entity's record, incl. composite/non-uuid PKs). The both-or-neither
-- binding mirrors CK_Conversation_LinkBinding.;

ALTER TABLE __mj."AIAgentSession"
 ADD COLUMN IF NOT EXISTS "LinkedEntityID" UUID NULL,
 ADD COLUMN IF NOT EXISTS "LinkedRecordID" VARCHAR(500) NULL,
 ADD CONSTRAINT "FK_AIAgentSession_LinkedEntity"
        FOREIGN KEY ("LinkedEntityID") REFERENCES __mj."Entity"("ID") DEFERRABLE INITIALLY DEFERRED,
 ADD CONSTRAINT "CK_AIAgentSession_LinkBinding"
        CHECK ("LinkedEntityID" IS NULL AND "LinkedRecordID" IS NULL OR "LinkedEntityID" IS NOT NULL AND "LinkedRecordID" IS NOT NULL);


-- =============================================================================
-- 4. Hand-authored non-FK lookup index (VisitorKey)
-- =============================================================================
-- NOT an FK index (CodeGen owns IDX_AUTO_MJ_FKEY_* for LastConversationID). Backs the
-- resolver lookup by the durable cookie VisitorKey. The resolved-identity lookup uses
-- the existing baseline index on (LinkedEntityID, LinkedRecordID).;

CREATE INDEX IF NOT EXISTS IX_Conversation_VisitorKey
    ON __mj."Conversation" ("VisitorKey");


-- =============================================================================
-- Extended properties
-- =============================================================================

-- ── ConversationWidgetInstance table + columns ──────────────────────────────;

ALTER TABLE __mj."ConversationWidgetInstance"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ConversationWidgetInstance */
ALTER TABLE __mj."ConversationWidgetInstance"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentSession_AgentID" ON __mj."AIAgentSession" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentSession_UserID" ON __mj."AIAgentSession" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentSession_ConversationID" ON __mj."AIAgentSession" ("ConversationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentSession_LastSessionID" ON __mj."AIAgentSession" ("LastSessionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentSession_RecordingFileID" ON __mj."AIAgentSession" ("RecordingFileID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentSession_LinkedEntityID" ON __mj."AIAgentSession" ("LinkedEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationWidgetInstance_ApplicationID" ON __mj."ConversationWidgetInstance" ("ApplicationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationWidgetInstance_PinnedAgentID" ON __mj."ConversationWidgetInstance" ("PinnedAgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationWidgetInstance_GuestRoleID" ON __mj."ConversationWidgetInstance" ("GuestRoleID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Conversation_UserID" ON __mj."Conversation" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID" ON __mj."Conversation" ("LinkedEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Conversation_DataContextID" ON __mj."Conversation" ("DataContextID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Conversation_EnvironmentID" ON __mj."Conversation" ("EnvironmentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Conversation_ProjectID" ON __mj."Conversation" ("ProjectID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Conversation_TestRunID" ON __mj."Conversation" ("TestRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Conversation_ApplicationID" ON __mj."Conversation" ("ApplicationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Conversation_DefaultAgentID" ON __mj."Conversation" ("DefaultAgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Conversation_RecordingFileID" ON __mj."Conversation" ("RecordingFileID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Conversation_LastConversationID" ON __mj."Conversation" ("LastConversationID");


-- ===================== Helper Functions (fn*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'fnAIAgentNoteConsolidatedIntoNoteID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnAIAgentNoteConsolidatedIntoNoteID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "ConsolidatedIntoNoteID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgentNote"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ConsolidatedIntoNoteID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgentNote" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ConsolidatedIntoNoteID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ConsolidatedIntoNoteID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'fnAIAgentSessionLastSessionID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnAIAgentSessionLastSessionID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "LastSessionID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgentSession"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."LastSessionID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgentSession" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."LastSessionID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "LastSessionID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'fnConversationLastConversationID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnConversationLastConversationID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "LastConversationID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."Conversation"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."LastConversationID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."Conversation" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."LastConversationID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "LastConversationID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwAIAgentNotes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentNotes"
AS SELECT
    a.*,
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJAIAgentNoteType_AgentNoteTypeID"."Name" AS "AgentNoteType",
    "MJUser_UserID"."Name" AS "User",
    "MJConversation_SourceConversationID"."Name" AS "SourceConversation",
    "MJConversationDetail_SourceConversationDetailID"."ExternalID" AS "SourceConversationDetail",
    "MJAIAgentRun_SourceAIAgentRunID"."RunName" AS "SourceAIAgentRun",
    "MJCompany_CompanyID"."Name" AS "Company",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel",
    "MJEntity_PrimaryScopeEntityID"."Name" AS "PrimaryScopeEntity",
    "MJAIAgentNote_ConsolidatedIntoNoteID"."Type" AS "ConsolidatedIntoNote",
    "root_ConsolidatedIntoNoteID"."RootID" AS "RootConsolidatedIntoNoteID"
FROM
    __mj."AIAgentNote" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    a."AgentID" = "MJAIAgent_AgentID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentNoteType" AS "MJAIAgentNoteType_AgentNoteTypeID"
  ON
    a."AgentNoteTypeID" = "MJAIAgentNoteType_AgentNoteTypeID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    a."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS "MJConversation_SourceConversationID"
  ON
    a."SourceConversationID" = "MJConversation_SourceConversationID"."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_SourceConversationDetailID"
  ON
    a."SourceConversationDetailID" = "MJConversationDetail_SourceConversationDetailID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_SourceAIAgentRunID"
  ON
    a."SourceAIAgentRunID" = "MJAIAgentRun_SourceAIAgentRunID"."ID"
LEFT OUTER JOIN
    __mj."Company" AS "MJCompany_CompanyID"
  ON
    a."CompanyID" = "MJCompany_CompanyID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    a."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_PrimaryScopeEntityID"
  ON
    a."PrimaryScopeEntityID" = "MJEntity_PrimaryScopeEntityID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentNote" AS "MJAIAgentNote_ConsolidatedIntoNoteID"
  ON
    a."ConsolidatedIntoNoteID" = "MJAIAgentNote_ConsolidatedIntoNoteID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIAgentNoteConsolidatedIntoNoteID_GetRootID"(a."ID", a."ConsolidatedIntoNoteID")) AS "root_ConsolidatedIntoNoteID"
    ON TRUE$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIAgentSessions';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentSessions"
AS SELECT
    a.*,
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJUser_UserID"."Name" AS "User",
    "MJConversation_ConversationID"."Name" AS "Conversation",
    "MJFile_RecordingFileID"."Name" AS "RecordingFile",
    "MJEntity_LinkedEntityID"."Name" AS "LinkedEntity",
    "root_LastSessionID"."RootID" AS "RootLastSessionID"
FROM
    __mj."AIAgentSession" AS a
INNER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    a."AgentID" = "MJAIAgent_AgentID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    a."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS "MJConversation_ConversationID"
  ON
    a."ConversationID" = "MJConversation_ConversationID"."ID"
LEFT OUTER JOIN
    __mj."File" AS "MJFile_RecordingFileID"
  ON
    a."RecordingFileID" = "MJFile_RecordingFileID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_LinkedEntityID"
  ON
    a."LinkedEntityID" = "MJEntity_LinkedEntityID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIAgentSessionLastSessionID_GetRootID"(a."ID", a."LastSessionID")) AS "root_LastSessionID"
    ON TRUE$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwConversationWidgetInstances';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationWidgetInstances"
AS SELECT
    c.*,
    "MJApplication_ApplicationID"."Name" AS "Application",
    "MJAIAgent_PinnedAgentID"."Name" AS "PinnedAgent",
    "MJRole_GuestRoleID"."Name" AS "GuestRole"
FROM
    __mj."ConversationWidgetInstance" AS c
INNER JOIN
    __mj."Application" AS "MJApplication_ApplicationID"
  ON
    c."ApplicationID" = "MJApplication_ApplicationID"."ID"
INNER JOIN
    __mj."AIAgent" AS "MJAIAgent_PinnedAgentID"
  ON
    c."PinnedAgentID" = "MJAIAgent_PinnedAgentID"."ID"
INNER JOIN
    __mj."Role" AS "MJRole_GuestRoleID"
  ON
    c."GuestRoleID" = "MJRole_GuestRoleID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwConversations';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversations"
AS SELECT
    c.*,
    "MJUser_UserID"."Name" AS "User",
    "MJEntity_LinkedEntityID"."Name" AS "LinkedEntity",
    "MJDataContext_DataContextID"."Name" AS "DataContext",
    "MJEnvironment_EnvironmentID"."Name" AS "Environment",
    "MJProject_ProjectID"."Name" AS "Project",
    "MJTestRun_TestRunID"."Test" AS "TestRun",
    "MJApplication_ApplicationID"."Name" AS "Application",
    "MJAIAgent_DefaultAgentID"."Name" AS "DefaultAgent",
    "MJFile_RecordingFileID"."Name" AS "RecordingFile",
    "MJConversation_LastConversationID"."Name" AS "LastConversation",
    "root_LastConversationID"."RootID" AS "RootLastConversationID"
FROM
    __mj."Conversation" AS c
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    c."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_LinkedEntityID"
  ON
    c."LinkedEntityID" = "MJEntity_LinkedEntityID"."ID"
LEFT OUTER JOIN
    __mj."DataContext" AS "MJDataContext_DataContextID"
  ON
    c."DataContextID" = "MJDataContext_DataContextID"."ID"
INNER JOIN
    __mj."Environment" AS "MJEnvironment_EnvironmentID"
  ON
    c."EnvironmentID" = "MJEnvironment_EnvironmentID"."ID"
LEFT OUTER JOIN
    __mj."Project" AS "MJProject_ProjectID"
  ON
    c."ProjectID" = "MJProject_ProjectID"."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS "MJTestRun_TestRunID"
  ON
    c."TestRunID" = "MJTestRun_TestRunID"."ID"
LEFT OUTER JOIN
    __mj."Application" AS "MJApplication_ApplicationID"
  ON
    c."ApplicationID" = "MJApplication_ApplicationID"."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_DefaultAgentID"
  ON
    c."DefaultAgentID" = "MJAIAgent_DefaultAgentID"."ID"
LEFT OUTER JOIN
    __mj."File" AS "MJFile_RecordingFileID"
  ON
    c."RecordingFileID" = "MJFile_RecordingFileID"."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS "MJConversation_LastConversationID"
  ON
    c."LastConversationID" = "MJConversation_LastConversationID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnConversationLastConversationID_GetRootID"(c."ID", c."LastConversationID")) AS "root_LastConversationID"
    ON TRUE$vsql$;
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
           WHERE proname = 'spCreateAIAgentNote'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentNote"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_AgentNoteTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentNoteTypeID UUID DEFAULT NULL,
    IN p_Note_Clear BOOLEAN DEFAULT FALSE,
    IN p_Note TEXT DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Type VARCHAR(20) DEFAULT NULL,
    IN p_IsAutoGenerated BOOLEAN DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SourceConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationID UUID DEFAULT NULL,
    IN p_SourceConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationDetailID UUID DEFAULT NULL,
    IN p_SourceAIAgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceAIAgentRunID UUID DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_EmbeddingVector_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingVector TEXT DEFAULT NULL,
    IN p_EmbeddingModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_PrimaryScopeEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeEntityID UUID DEFAULT NULL,
    IN p_PrimaryScopeRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeRecordID VARCHAR(100) DEFAULT NULL,
    IN p_SecondaryScopes_Clear BOOLEAN DEFAULT FALSE,
    IN p_SecondaryScopes TEXT DEFAULT NULL,
    IN p_LastAccessedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastAccessedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_AccessCount INTEGER DEFAULT NULL,
    IN p_ExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ConsolidatedIntoNoteID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConsolidatedIntoNoteID UUID DEFAULT NULL,
    IN p_ConsolidationCount INTEGER DEFAULT NULL,
    IN p_DerivedFromNoteIDs_Clear BOOLEAN DEFAULT FALSE,
    IN p_DerivedFromNoteIDs TEXT DEFAULT NULL,
    IN p_ProtectionTier VARCHAR(20) DEFAULT NULL,
    IN p_ImportanceScore_Clear BOOLEAN DEFAULT FALSE,
    IN p_ImportanceScore NUMERIC(5,2) DEFAULT NULL,
    IN p_AuthorType VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentNotes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentNote"
            (
                "ID",
                "AgentID",
                "AgentNoteTypeID",
                "Note",
                "UserID",
                "Type",
                "IsAutoGenerated",
                "Comments",
                "Status",
                "SourceConversationID",
                "SourceConversationDetailID",
                "SourceAIAgentRunID",
                "CompanyID",
                "EmbeddingVector",
                "EmbeddingModelID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "LastAccessedAt",
                "AccessCount",
                "ExpiresAt",
                "ConsolidatedIntoNoteID",
                "ConsolidationCount",
                "DerivedFromNoteIDs",
                "ProtectionTier",
                "ImportanceScore",
                "AuthorType"
            )
        VALUES
            (
                p_ID,
                CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, NULL) END,
                CASE WHEN p_AgentNoteTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentNoteTypeID, NULL) END,
                CASE WHEN p_Note_Clear = TRUE THEN NULL ELSE COALESCE(p_Note, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                COALESCE(p_Type, 'Preference'),
                COALESCE(p_IsAutoGenerated, FALSE),
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_SourceConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationID, NULL) END,
                CASE WHEN p_SourceConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationDetailID, NULL) END,
                CASE WHEN p_SourceAIAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceAIAgentRunID, NULL) END,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END,
                CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, NULL) END,
                CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, NULL) END,
                CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, NULL) END,
                CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, NULL) END,
                CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, NULL) END,
                CASE WHEN p_LastAccessedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastAccessedAt, NULL) END,
                COALESCE(p_AccessCount, 0),
                CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, NULL) END,
                CASE WHEN p_ConsolidatedIntoNoteID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConsolidatedIntoNoteID, NULL) END,
                COALESCE(p_ConsolidationCount, 0),
                CASE WHEN p_DerivedFromNoteIDs_Clear = TRUE THEN NULL ELSE COALESCE(p_DerivedFromNoteIDs, NULL) END,
                COALESCE(p_ProtectionTier, 'Standard'),
                CASE WHEN p_ImportanceScore_Clear = TRUE THEN NULL ELSE COALESCE(p_ImportanceScore, NULL) END,
                COALESCE(p_AuthorType, 'MemoryManager')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentNote"
            (
                "AgentID",
                "AgentNoteTypeID",
                "Note",
                "UserID",
                "Type",
                "IsAutoGenerated",
                "Comments",
                "Status",
                "SourceConversationID",
                "SourceConversationDetailID",
                "SourceAIAgentRunID",
                "CompanyID",
                "EmbeddingVector",
                "EmbeddingModelID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "LastAccessedAt",
                "AccessCount",
                "ExpiresAt",
                "ConsolidatedIntoNoteID",
                "ConsolidationCount",
                "DerivedFromNoteIDs",
                "ProtectionTier",
                "ImportanceScore",
                "AuthorType"
            )
        VALUES
            (
                CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, NULL) END,
                CASE WHEN p_AgentNoteTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentNoteTypeID, NULL) END,
                CASE WHEN p_Note_Clear = TRUE THEN NULL ELSE COALESCE(p_Note, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                COALESCE(p_Type, 'Preference'),
                COALESCE(p_IsAutoGenerated, FALSE),
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_SourceConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationID, NULL) END,
                CASE WHEN p_SourceConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationDetailID, NULL) END,
                CASE WHEN p_SourceAIAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceAIAgentRunID, NULL) END,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END,
                CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, NULL) END,
                CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, NULL) END,
                CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, NULL) END,
                CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, NULL) END,
                CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, NULL) END,
                CASE WHEN p_LastAccessedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastAccessedAt, NULL) END,
                COALESCE(p_AccessCount, 0),
                CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, NULL) END,
                CASE WHEN p_ConsolidatedIntoNoteID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConsolidatedIntoNoteID, NULL) END,
                COALESCE(p_ConsolidationCount, 0),
                CASE WHEN p_DerivedFromNoteIDs_Clear = TRUE THEN NULL ELSE COALESCE(p_DerivedFromNoteIDs, NULL) END,
                COALESCE(p_ProtectionTier, 'Standard'),
                CASE WHEN p_ImportanceScore_Clear = TRUE THEN NULL ELSE COALESCE(p_ImportanceScore, NULL) END,
                COALESCE(p_AuthorType, 'MemoryManager')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentNotes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgentNote'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentNote"(
    IN p_ID UUID,
    IN p_AgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_AgentNoteTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentNoteTypeID UUID DEFAULT NULL,
    IN p_Note_Clear BOOLEAN DEFAULT FALSE,
    IN p_Note TEXT DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Type VARCHAR(20) DEFAULT NULL,
    IN p_IsAutoGenerated BOOLEAN DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SourceConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationID UUID DEFAULT NULL,
    IN p_SourceConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationDetailID UUID DEFAULT NULL,
    IN p_SourceAIAgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceAIAgentRunID UUID DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_EmbeddingVector_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingVector TEXT DEFAULT NULL,
    IN p_EmbeddingModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_PrimaryScopeEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeEntityID UUID DEFAULT NULL,
    IN p_PrimaryScopeRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeRecordID VARCHAR(100) DEFAULT NULL,
    IN p_SecondaryScopes_Clear BOOLEAN DEFAULT FALSE,
    IN p_SecondaryScopes TEXT DEFAULT NULL,
    IN p_LastAccessedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastAccessedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_AccessCount INTEGER DEFAULT NULL,
    IN p_ExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ConsolidatedIntoNoteID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConsolidatedIntoNoteID UUID DEFAULT NULL,
    IN p_ConsolidationCount INTEGER DEFAULT NULL,
    IN p_DerivedFromNoteIDs_Clear BOOLEAN DEFAULT FALSE,
    IN p_DerivedFromNoteIDs TEXT DEFAULT NULL,
    IN p_ProtectionTier VARCHAR(20) DEFAULT NULL,
    IN p_ImportanceScore_Clear BOOLEAN DEFAULT FALSE,
    IN p_ImportanceScore NUMERIC(5,2) DEFAULT NULL,
    IN p_AuthorType VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentNotes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentNote"
    SET
        "AgentID" = CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, "AgentID") END,
        "AgentNoteTypeID" = CASE WHEN p_AgentNoteTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentNoteTypeID, "AgentNoteTypeID") END,
        "Note" = CASE WHEN p_Note_Clear = TRUE THEN NULL ELSE COALESCE(p_Note, "Note") END,
        "UserID" = CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, "UserID") END,
        "Type" = COALESCE(p_Type, "Type"),
        "IsAutoGenerated" = COALESCE(p_IsAutoGenerated, "IsAutoGenerated"),
        "Comments" = CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, "Comments") END,
        "Status" = COALESCE(p_Status, "Status"),
        "SourceConversationID" = CASE WHEN p_SourceConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationID, "SourceConversationID") END,
        "SourceConversationDetailID" = CASE WHEN p_SourceConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationDetailID, "SourceConversationDetailID") END,
        "SourceAIAgentRunID" = CASE WHEN p_SourceAIAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceAIAgentRunID, "SourceAIAgentRunID") END,
        "CompanyID" = CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, "CompanyID") END,
        "EmbeddingVector" = CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, "EmbeddingModelID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, "SecondaryScopes") END,
        "LastAccessedAt" = CASE WHEN p_LastAccessedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastAccessedAt, "LastAccessedAt") END,
        "AccessCount" = COALESCE(p_AccessCount, "AccessCount"),
        "ExpiresAt" = CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, "ExpiresAt") END,
        "ConsolidatedIntoNoteID" = CASE WHEN p_ConsolidatedIntoNoteID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConsolidatedIntoNoteID, "ConsolidatedIntoNoteID") END,
        "ConsolidationCount" = COALESCE(p_ConsolidationCount, "ConsolidationCount"),
        "DerivedFromNoteIDs" = CASE WHEN p_DerivedFromNoteIDs_Clear = TRUE THEN NULL ELSE COALESCE(p_DerivedFromNoteIDs, "DerivedFromNoteIDs") END,
        "ProtectionTier" = COALESCE(p_ProtectionTier, "ProtectionTier"),
        "ImportanceScore" = CASE WHEN p_ImportanceScore_Clear = TRUE THEN NULL ELSE COALESCE(p_ImportanceScore, "ImportanceScore") END,
        "AuthorType" = COALESCE(p_AuthorType, "AuthorType")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentNotes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentNotes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentNote'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentNote"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentNote"
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
           WHERE proname = 'spCreateAIAgentSession'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentSession"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_LastSessionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastSessionID UUID DEFAULT NULL,
    IN p_HostInstanceID_Clear BOOLEAN DEFAULT FALSE,
    IN p_HostInstanceID VARCHAR(200) DEFAULT NULL,
    IN p_Config_Clear BOOLEAN DEFAULT FALSE,
    IN p_Config TEXT DEFAULT NULL,
    IN p_LastActiveAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ClosedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ClosedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CloseReason_Clear BOOLEAN DEFAULT FALSE,
    IN p_CloseReason VARCHAR(20) DEFAULT NULL,
    IN p_RecordingMedia_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordingMedia VARCHAR(20) DEFAULT NULL,
    IN p_RecordingStartedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordingStartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RecordingFileID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordingFileID UUID DEFAULT NULL,
    IN p_LinkedEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedEntityID UUID DEFAULT NULL,
    IN p_LinkedRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedRecordID VARCHAR(500) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentSessions" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentSession"
            (
                "ID",
                "AgentID",
                "UserID",
                "Status",
                "ConversationID",
                "LastSessionID",
                "HostInstanceID",
                "Config",
                "LastActiveAt",
                "ClosedAt",
                "CloseReason",
                "RecordingMedia",
                "RecordingStartedAt",
                "RecordingFileID",
                "LinkedEntityID",
                "LinkedRecordID"
            )
        VALUES
            (
                p_ID,
                p_AgentID,
                p_UserID,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, NULL) END,
                CASE WHEN p_LastSessionID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastSessionID, NULL) END,
                CASE WHEN p_HostInstanceID_Clear = TRUE THEN NULL ELSE COALESCE(p_HostInstanceID, NULL) END,
                CASE WHEN p_Config_Clear = TRUE THEN NULL ELSE COALESCE(p_Config, NULL) END,
                COALESCE(p_LastActiveAt, NOW()),
                CASE WHEN p_ClosedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClosedAt, NULL) END,
                CASE WHEN p_CloseReason_Clear = TRUE THEN NULL ELSE COALESCE(p_CloseReason, NULL) END,
                CASE WHEN p_RecordingMedia_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingMedia, NULL) END,
                CASE WHEN p_RecordingStartedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingStartedAt, NULL) END,
                CASE WHEN p_RecordingFileID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingFileID, NULL) END,
                CASE WHEN p_LinkedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedEntityID, NULL) END,
                CASE WHEN p_LinkedRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedRecordID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentSession"
            (
                "AgentID",
                "UserID",
                "Status",
                "ConversationID",
                "LastSessionID",
                "HostInstanceID",
                "Config",
                "LastActiveAt",
                "ClosedAt",
                "CloseReason",
                "RecordingMedia",
                "RecordingStartedAt",
                "RecordingFileID",
                "LinkedEntityID",
                "LinkedRecordID"
            )
        VALUES
            (
                p_AgentID,
                p_UserID,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, NULL) END,
                CASE WHEN p_LastSessionID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastSessionID, NULL) END,
                CASE WHEN p_HostInstanceID_Clear = TRUE THEN NULL ELSE COALESCE(p_HostInstanceID, NULL) END,
                CASE WHEN p_Config_Clear = TRUE THEN NULL ELSE COALESCE(p_Config, NULL) END,
                COALESCE(p_LastActiveAt, NOW()),
                CASE WHEN p_ClosedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClosedAt, NULL) END,
                CASE WHEN p_CloseReason_Clear = TRUE THEN NULL ELSE COALESCE(p_CloseReason, NULL) END,
                CASE WHEN p_RecordingMedia_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingMedia, NULL) END,
                CASE WHEN p_RecordingStartedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingStartedAt, NULL) END,
                CASE WHEN p_RecordingFileID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingFileID, NULL) END,
                CASE WHEN p_LinkedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedEntityID, NULL) END,
                CASE WHEN p_LinkedRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedRecordID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentSessions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgentSession'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentSession"(
    IN p_ID UUID,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_LastSessionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastSessionID UUID DEFAULT NULL,
    IN p_HostInstanceID_Clear BOOLEAN DEFAULT FALSE,
    IN p_HostInstanceID VARCHAR(200) DEFAULT NULL,
    IN p_Config_Clear BOOLEAN DEFAULT FALSE,
    IN p_Config TEXT DEFAULT NULL,
    IN p_LastActiveAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ClosedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ClosedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CloseReason_Clear BOOLEAN DEFAULT FALSE,
    IN p_CloseReason VARCHAR(20) DEFAULT NULL,
    IN p_RecordingMedia_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordingMedia VARCHAR(20) DEFAULT NULL,
    IN p_RecordingStartedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordingStartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RecordingFileID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordingFileID UUID DEFAULT NULL,
    IN p_LinkedEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedEntityID UUID DEFAULT NULL,
    IN p_LinkedRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedRecordID VARCHAR(500) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentSessions" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentSession"
    SET
        "AgentID" = COALESCE(p_AgentID, "AgentID"),
        "UserID" = COALESCE(p_UserID, "UserID"),
        "Status" = COALESCE(p_Status, "Status"),
        "ConversationID" = CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, "ConversationID") END,
        "LastSessionID" = CASE WHEN p_LastSessionID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastSessionID, "LastSessionID") END,
        "HostInstanceID" = CASE WHEN p_HostInstanceID_Clear = TRUE THEN NULL ELSE COALESCE(p_HostInstanceID, "HostInstanceID") END,
        "Config" = CASE WHEN p_Config_Clear = TRUE THEN NULL ELSE COALESCE(p_Config, "Config") END,
        "LastActiveAt" = COALESCE(p_LastActiveAt, "LastActiveAt"),
        "ClosedAt" = CASE WHEN p_ClosedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClosedAt, "ClosedAt") END,
        "CloseReason" = CASE WHEN p_CloseReason_Clear = TRUE THEN NULL ELSE COALESCE(p_CloseReason, "CloseReason") END,
        "RecordingMedia" = CASE WHEN p_RecordingMedia_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingMedia, "RecordingMedia") END,
        "RecordingStartedAt" = CASE WHEN p_RecordingStartedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingStartedAt, "RecordingStartedAt") END,
        "RecordingFileID" = CASE WHEN p_RecordingFileID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingFileID, "RecordingFileID") END,
        "LinkedEntityID" = CASE WHEN p_LinkedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedEntityID, "LinkedEntityID") END,
        "LinkedRecordID" = CASE WHEN p_LinkedRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedRecordID, "LinkedRecordID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentSessions" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentSessions" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentSession'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentSession"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentSession"
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
           WHERE proname = 'spCreateConversationWidgetInstance'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateConversationWidgetInstance"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_PublicKey VARCHAR(100) DEFAULT NULL,
    IN p_ApplicationID UUID DEFAULT NULL,
    IN p_PinnedAgentID UUID DEFAULT NULL,
    IN p_GuestRoleID UUID DEFAULT NULL,
    IN p_AllowedOrigins_Clear BOOLEAN DEFAULT FALSE,
    IN p_AllowedOrigins TEXT DEFAULT NULL,
    IN p_Modality VARCHAR(10) DEFAULT NULL,
    IN p_AuthStrategy VARCHAR(20) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SessionTTLMinutes INTEGER DEFAULT NULL,
    IN p_RateLimitPerMinute INTEGER DEFAULT NULL,
    IN p_VoiceMaxSessionMinutes_Clear BOOLEAN DEFAULT FALSE,
    IN p_VoiceMaxSessionMinutes INTEGER DEFAULT NULL,
    IN p_EnabledChannels_Clear BOOLEAN DEFAULT FALSE,
    IN p_EnabledChannels TEXT DEFAULT NULL,
    IN p_HostPublicKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_HostPublicKey TEXT DEFAULT NULL,
    IN p_RememberReturningVisitors BOOLEAN DEFAULT NULL,
    IN p_VisitorMemoryRetentionDays_Clear BOOLEAN DEFAULT FALSE,
    IN p_VisitorMemoryRetentionDays INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationWidgetInstances" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ConversationWidgetInstance"
            (
                "ID",
                "Name",
                "PublicKey",
                "ApplicationID",
                "PinnedAgentID",
                "GuestRoleID",
                "AllowedOrigins",
                "Modality",
                "AuthStrategy",
                "Status",
                "SessionTTLMinutes",
                "RateLimitPerMinute",
                "VoiceMaxSessionMinutes",
                "EnabledChannels",
                "HostPublicKey",
                "RememberReturningVisitors",
                "VisitorMemoryRetentionDays"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_PublicKey,
                p_ApplicationID,
                p_PinnedAgentID,
                p_GuestRoleID,
                CASE WHEN p_AllowedOrigins_Clear = TRUE THEN NULL ELSE COALESCE(p_AllowedOrigins, NULL) END,
                COALESCE(p_Modality, 'Text'),
                COALESCE(p_AuthStrategy, 'Anonymous'),
                COALESCE(p_Status, 'Active'),
                COALESCE(p_SessionTTLMinutes, 15),
                COALESCE(p_RateLimitPerMinute, 30),
                CASE WHEN p_VoiceMaxSessionMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_VoiceMaxSessionMinutes, NULL) END,
                CASE WHEN p_EnabledChannels_Clear = TRUE THEN NULL ELSE COALESCE(p_EnabledChannels, NULL) END,
                CASE WHEN p_HostPublicKey_Clear = TRUE THEN NULL ELSE COALESCE(p_HostPublicKey, NULL) END,
                COALESCE(p_RememberReturningVisitors, FALSE),
                CASE WHEN p_VisitorMemoryRetentionDays_Clear = TRUE THEN NULL ELSE COALESCE(p_VisitorMemoryRetentionDays, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ConversationWidgetInstance"
            (
                "Name",
                "PublicKey",
                "ApplicationID",
                "PinnedAgentID",
                "GuestRoleID",
                "AllowedOrigins",
                "Modality",
                "AuthStrategy",
                "Status",
                "SessionTTLMinutes",
                "RateLimitPerMinute",
                "VoiceMaxSessionMinutes",
                "EnabledChannels",
                "HostPublicKey",
                "RememberReturningVisitors",
                "VisitorMemoryRetentionDays"
            )
        VALUES
            (
                p_Name,
                p_PublicKey,
                p_ApplicationID,
                p_PinnedAgentID,
                p_GuestRoleID,
                CASE WHEN p_AllowedOrigins_Clear = TRUE THEN NULL ELSE COALESCE(p_AllowedOrigins, NULL) END,
                COALESCE(p_Modality, 'Text'),
                COALESCE(p_AuthStrategy, 'Anonymous'),
                COALESCE(p_Status, 'Active'),
                COALESCE(p_SessionTTLMinutes, 15),
                COALESCE(p_RateLimitPerMinute, 30),
                CASE WHEN p_VoiceMaxSessionMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_VoiceMaxSessionMinutes, NULL) END,
                CASE WHEN p_EnabledChannels_Clear = TRUE THEN NULL ELSE COALESCE(p_EnabledChannels, NULL) END,
                CASE WHEN p_HostPublicKey_Clear = TRUE THEN NULL ELSE COALESCE(p_HostPublicKey, NULL) END,
                COALESCE(p_RememberReturningVisitors, FALSE),
                CASE WHEN p_VisitorMemoryRetentionDays_Clear = TRUE THEN NULL ELSE COALESCE(p_VisitorMemoryRetentionDays, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwConversationWidgetInstances" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateConversationWidgetInstance'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateConversationWidgetInstance"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_PublicKey VARCHAR(100) DEFAULT NULL,
    IN p_ApplicationID UUID DEFAULT NULL,
    IN p_PinnedAgentID UUID DEFAULT NULL,
    IN p_GuestRoleID UUID DEFAULT NULL,
    IN p_AllowedOrigins_Clear BOOLEAN DEFAULT FALSE,
    IN p_AllowedOrigins TEXT DEFAULT NULL,
    IN p_Modality VARCHAR(10) DEFAULT NULL,
    IN p_AuthStrategy VARCHAR(20) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SessionTTLMinutes INTEGER DEFAULT NULL,
    IN p_RateLimitPerMinute INTEGER DEFAULT NULL,
    IN p_VoiceMaxSessionMinutes_Clear BOOLEAN DEFAULT FALSE,
    IN p_VoiceMaxSessionMinutes INTEGER DEFAULT NULL,
    IN p_EnabledChannels_Clear BOOLEAN DEFAULT FALSE,
    IN p_EnabledChannels TEXT DEFAULT NULL,
    IN p_HostPublicKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_HostPublicKey TEXT DEFAULT NULL,
    IN p_RememberReturningVisitors BOOLEAN DEFAULT NULL,
    IN p_VisitorMemoryRetentionDays_Clear BOOLEAN DEFAULT FALSE,
    IN p_VisitorMemoryRetentionDays INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationWidgetInstances" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ConversationWidgetInstance"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "PublicKey" = COALESCE(p_PublicKey, "PublicKey"),
        "ApplicationID" = COALESCE(p_ApplicationID, "ApplicationID"),
        "PinnedAgentID" = COALESCE(p_PinnedAgentID, "PinnedAgentID"),
        "GuestRoleID" = COALESCE(p_GuestRoleID, "GuestRoleID"),
        "AllowedOrigins" = CASE WHEN p_AllowedOrigins_Clear = TRUE THEN NULL ELSE COALESCE(p_AllowedOrigins, "AllowedOrigins") END,
        "Modality" = COALESCE(p_Modality, "Modality"),
        "AuthStrategy" = COALESCE(p_AuthStrategy, "AuthStrategy"),
        "Status" = COALESCE(p_Status, "Status"),
        "SessionTTLMinutes" = COALESCE(p_SessionTTLMinutes, "SessionTTLMinutes"),
        "RateLimitPerMinute" = COALESCE(p_RateLimitPerMinute, "RateLimitPerMinute"),
        "VoiceMaxSessionMinutes" = CASE WHEN p_VoiceMaxSessionMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_VoiceMaxSessionMinutes, "VoiceMaxSessionMinutes") END,
        "EnabledChannels" = CASE WHEN p_EnabledChannels_Clear = TRUE THEN NULL ELSE COALESCE(p_EnabledChannels, "EnabledChannels") END,
        "HostPublicKey" = CASE WHEN p_HostPublicKey_Clear = TRUE THEN NULL ELSE COALESCE(p_HostPublicKey, "HostPublicKey") END,
        "RememberReturningVisitors" = COALESCE(p_RememberReturningVisitors, "RememberReturningVisitors"),
        "VisitorMemoryRetentionDays" = CASE WHEN p_VisitorMemoryRetentionDays_Clear = TRUE THEN NULL ELSE COALESCE(p_VisitorMemoryRetentionDays, "VisitorMemoryRetentionDays") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwConversationWidgetInstances" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwConversationWidgetInstances" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationWidgetInstance'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationWidgetInstance"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ConversationWidgetInstance"
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
           WHERE proname = 'spCreateConversation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateConversation"(
    IN p_ID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_ExternalID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalID VARCHAR(500) DEFAULT NULL,
    IN p_Name_Clear BOOLEAN DEFAULT FALSE,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Type VARCHAR(50) DEFAULT NULL,
    IN p_IsArchived BOOLEAN DEFAULT NULL,
    IN p_LinkedEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedEntityID UUID DEFAULT NULL,
    IN p_LinkedRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedRecordID VARCHAR(500) DEFAULT NULL,
    IN p_DataContextID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DataContextID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_EnvironmentID UUID DEFAULT NULL,
    IN p_ProjectID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ProjectID UUID DEFAULT NULL,
    IN p_IsPinned BOOLEAN DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_ApplicationScope VARCHAR(20) DEFAULT NULL,
    IN p_ApplicationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ApplicationID UUID DEFAULT NULL,
    IN p_DefaultAgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultAgentID UUID DEFAULT NULL,
    IN p_AdditionalData_Clear BOOLEAN DEFAULT FALSE,
    IN p_AdditionalData TEXT DEFAULT NULL,
    IN p_RecordingFileID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordingFileID UUID DEFAULT NULL,
    IN p_EgressID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EgressID VARCHAR(255) DEFAULT NULL,
    IN p_VisitorKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_VisitorKey VARCHAR(255) DEFAULT NULL,
    IN p_LastConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastConversationID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwConversations" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."Conversation"
            (
                "ID",
                "UserID",
                "ExternalID",
                "Name",
                "Description",
                "Type",
                "IsArchived",
                "LinkedEntityID",
                "LinkedRecordID",
                "DataContextID",
                "Status",
                "EnvironmentID",
                "ProjectID",
                "IsPinned",
                "TestRunID",
                "ApplicationScope",
                "ApplicationID",
                "DefaultAgentID",
                "AdditionalData",
                "RecordingFileID",
                "EgressID",
                "VisitorKey",
                "LastConversationID"
            )
        VALUES
            (
                p_ID,
                p_UserID,
                CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, NULL) END,
                CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Type, 'Skip'),
                COALESCE(p_IsArchived, FALSE),
                CASE WHEN p_LinkedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedEntityID, NULL) END,
                CASE WHEN p_LinkedRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedRecordID, NULL) END,
                CASE WHEN p_DataContextID_Clear = TRUE THEN NULL ELSE COALESCE(p_DataContextID, NULL) END,
                COALESCE(p_Status, 'Available'),
                CASE WHEN p_EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN p_ProjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_ProjectID, NULL) END,
                COALESCE(p_IsPinned, FALSE),
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END,
                COALESCE(p_ApplicationScope, 'Global'),
                CASE WHEN p_ApplicationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ApplicationID, NULL) END,
                CASE WHEN p_DefaultAgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultAgentID, NULL) END,
                CASE WHEN p_AdditionalData_Clear = TRUE THEN NULL ELSE COALESCE(p_AdditionalData, NULL) END,
                CASE WHEN p_RecordingFileID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingFileID, NULL) END,
                CASE WHEN p_EgressID_Clear = TRUE THEN NULL ELSE COALESCE(p_EgressID, NULL) END,
                CASE WHEN p_VisitorKey_Clear = TRUE THEN NULL ELSE COALESCE(p_VisitorKey, NULL) END,
                CASE WHEN p_LastConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastConversationID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."Conversation"
            (
                "UserID",
                "ExternalID",
                "Name",
                "Description",
                "Type",
                "IsArchived",
                "LinkedEntityID",
                "LinkedRecordID",
                "DataContextID",
                "Status",
                "EnvironmentID",
                "ProjectID",
                "IsPinned",
                "TestRunID",
                "ApplicationScope",
                "ApplicationID",
                "DefaultAgentID",
                "AdditionalData",
                "RecordingFileID",
                "EgressID",
                "VisitorKey",
                "LastConversationID"
            )
        VALUES
            (
                p_UserID,
                CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, NULL) END,
                CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Type, 'Skip'),
                COALESCE(p_IsArchived, FALSE),
                CASE WHEN p_LinkedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedEntityID, NULL) END,
                CASE WHEN p_LinkedRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedRecordID, NULL) END,
                CASE WHEN p_DataContextID_Clear = TRUE THEN NULL ELSE COALESCE(p_DataContextID, NULL) END,
                COALESCE(p_Status, 'Available'),
                CASE WHEN p_EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN p_ProjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_ProjectID, NULL) END,
                COALESCE(p_IsPinned, FALSE),
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END,
                COALESCE(p_ApplicationScope, 'Global'),
                CASE WHEN p_ApplicationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ApplicationID, NULL) END,
                CASE WHEN p_DefaultAgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultAgentID, NULL) END,
                CASE WHEN p_AdditionalData_Clear = TRUE THEN NULL ELSE COALESCE(p_AdditionalData, NULL) END,
                CASE WHEN p_RecordingFileID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingFileID, NULL) END,
                CASE WHEN p_EgressID_Clear = TRUE THEN NULL ELSE COALESCE(p_EgressID, NULL) END,
                CASE WHEN p_VisitorKey_Clear = TRUE THEN NULL ELSE COALESCE(p_VisitorKey, NULL) END,
                CASE WHEN p_LastConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastConversationID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwConversations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateConversation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateConversation"(
    IN p_ID UUID,
    IN p_UserID UUID DEFAULT NULL,
    IN p_ExternalID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalID VARCHAR(500) DEFAULT NULL,
    IN p_Name_Clear BOOLEAN DEFAULT FALSE,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Type VARCHAR(50) DEFAULT NULL,
    IN p_IsArchived BOOLEAN DEFAULT NULL,
    IN p_LinkedEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedEntityID UUID DEFAULT NULL,
    IN p_LinkedRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LinkedRecordID VARCHAR(500) DEFAULT NULL,
    IN p_DataContextID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DataContextID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_EnvironmentID UUID DEFAULT NULL,
    IN p_ProjectID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ProjectID UUID DEFAULT NULL,
    IN p_IsPinned BOOLEAN DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_ApplicationScope VARCHAR(20) DEFAULT NULL,
    IN p_ApplicationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ApplicationID UUID DEFAULT NULL,
    IN p_DefaultAgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultAgentID UUID DEFAULT NULL,
    IN p_AdditionalData_Clear BOOLEAN DEFAULT FALSE,
    IN p_AdditionalData TEXT DEFAULT NULL,
    IN p_RecordingFileID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordingFileID UUID DEFAULT NULL,
    IN p_EgressID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EgressID VARCHAR(255) DEFAULT NULL,
    IN p_VisitorKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_VisitorKey VARCHAR(255) DEFAULT NULL,
    IN p_LastConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastConversationID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwConversations" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."Conversation"
    SET
        "UserID" = COALESCE(p_UserID, "UserID"),
        "ExternalID" = CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, "ExternalID") END,
        "Name" = CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, "Name") END,
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "Type" = COALESCE(p_Type, "Type"),
        "IsArchived" = COALESCE(p_IsArchived, "IsArchived"),
        "LinkedEntityID" = CASE WHEN p_LinkedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedEntityID, "LinkedEntityID") END,
        "LinkedRecordID" = CASE WHEN p_LinkedRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_LinkedRecordID, "LinkedRecordID") END,
        "DataContextID" = CASE WHEN p_DataContextID_Clear = TRUE THEN NULL ELSE COALESCE(p_DataContextID, "DataContextID") END,
        "Status" = COALESCE(p_Status, "Status"),
        "EnvironmentID" = COALESCE(p_EnvironmentID, "EnvironmentID"),
        "ProjectID" = CASE WHEN p_ProjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_ProjectID, "ProjectID") END,
        "IsPinned" = COALESCE(p_IsPinned, "IsPinned"),
        "TestRunID" = CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, "TestRunID") END,
        "ApplicationScope" = COALESCE(p_ApplicationScope, "ApplicationScope"),
        "ApplicationID" = CASE WHEN p_ApplicationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ApplicationID, "ApplicationID") END,
        "DefaultAgentID" = CASE WHEN p_DefaultAgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultAgentID, "DefaultAgentID") END,
        "AdditionalData" = CASE WHEN p_AdditionalData_Clear = TRUE THEN NULL ELSE COALESCE(p_AdditionalData, "AdditionalData") END,
        "RecordingFileID" = CASE WHEN p_RecordingFileID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordingFileID, "RecordingFileID") END,
        "EgressID" = CASE WHEN p_EgressID_Clear = TRUE THEN NULL ELSE COALESCE(p_EgressID, "EgressID") END,
        "VisitorKey" = CASE WHEN p_VisitorKey_Clear = TRUE THEN NULL ELSE COALESCE(p_VisitorKey, "VisitorKey") END,
        "LastConversationID" = CASE WHEN p_LastConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastConversationID, "LastConversationID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwConversations" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwConversations" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversation"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentExamples_SourceConversationIDID UUID;
    p_MJAIAgentExamples_SourceConversationID_AgentID UUID;
    p_MJAIAgentExamples_SourceConversationID_UserID UUID;
    p_MJAIAgentExamples_SourceConversationID_CompanyID UUID;
    p_MJAIAgentExamples_SourceConversationID_Type VARCHAR(20);
    p_MJAIAgentExamples_SourceConversationID_ExampleInput TEXT;
    p_MJAIAgentExamples_SourceConversationID_ExampleOutput TEXT;
    p_MJAIAgentExamples_SourceConversationID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentExamples_SourceConversationID_SourceConversationID UUID;
    p_MJAIAgentExamples_SourceConversationID_SourceConversati_b98bb5 UUID;
    p_MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID UUID;
    p_MJAIAgentExamples_SourceConversationID_SuccessScore NUMERIC(5,2);
    p_MJAIAgentExamples_SourceConversationID_Comments TEXT;
    p_MJAIAgentExamples_SourceConversationID_Status VARCHAR(20);
    p_MJAIAgentExamples_SourceConversationID_EmbeddingVector TEXT;
    p_MJAIAgentExamples_SourceConversationID_EmbeddingModelID UUID;
    p_MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID UUID;
    p_MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentExamples_SourceConversationID_SecondaryScopes TEXT;
    p_MJAIAgentExamples_SourceConversationID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentExamples_SourceConversationID_AccessCount INTEGER;
    p_MJAIAgentExamples_SourceConversationID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationIDID UUID;
    p_MJAIAgentNotes_SourceConversationID_AgentID UUID;
    p_MJAIAgentNotes_SourceConversationID_AgentNoteTypeID UUID;
    p_MJAIAgentNotes_SourceConversationID_Note TEXT;
    p_MJAIAgentNotes_SourceConversationID_UserID UUID;
    p_MJAIAgentNotes_SourceConversationID_Type VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentNotes_SourceConversationID_Comments TEXT;
    p_MJAIAgentNotes_SourceConversationID_Status VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationID_SourceConversationID UUID;
    p_MJAIAgentNotes_SourceConversationID_SourceConversationD_de4992 UUID;
    p_MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID UUID;
    p_MJAIAgentNotes_SourceConversationID_CompanyID UUID;
    p_MJAIAgentNotes_SourceConversationID_EmbeddingVector TEXT;
    p_MJAIAgentNotes_SourceConversationID_EmbeddingModelID UUID;
    p_MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID UUID;
    p_MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentNotes_SourceConversationID_SecondaryScopes TEXT;
    p_MJAIAgentNotes_SourceConversationID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationID_AccessCount INTEGER;
    p_MJAIAgentNotes_SourceConversationID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID UUID;
    p_MJAIAgentNotes_SourceConversationID_ConsolidationCount INTEGER;
    p_MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs TEXT;
    p_MJAIAgentNotes_SourceConversationID_ProtectionTier VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationID_ImportanceScore NUMERIC(5,2);
    p_MJAIAgentNotes_SourceConversationID_AuthorType VARCHAR(20);
    p_MJAIAgentRuns_ConversationIDID UUID;
    p_MJAIAgentRuns_ConversationID_AgentID UUID;
    p_MJAIAgentRuns_ConversationID_ParentRunID UUID;
    p_MJAIAgentRuns_ConversationID_Status VARCHAR(50);
    p_MJAIAgentRuns_ConversationID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationID_Success BOOLEAN;
    p_MJAIAgentRuns_ConversationID_ErrorMessage TEXT;
    p_MJAIAgentRuns_ConversationID_ConversationID UUID;
    p_MJAIAgentRuns_ConversationID_UserID UUID;
    p_MJAIAgentRuns_ConversationID_Result TEXT;
    p_MJAIAgentRuns_ConversationID_AgentState TEXT;
    p_MJAIAgentRuns_ConversationID_TotalTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCost NUMERIC(18,6);
    p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCostRollup NUMERIC(19,8);
    p_MJAIAgentRuns_ConversationID_ConversationDetailID UUID;
    p_MJAIAgentRuns_ConversationID_ConversationDetailSequence INTEGER;
    p_MJAIAgentRuns_ConversationID_CancellationReason VARCHAR(30);
    p_MJAIAgentRuns_ConversationID_FinalStep VARCHAR(30);
    p_MJAIAgentRuns_ConversationID_FinalPayload TEXT;
    p_MJAIAgentRuns_ConversationID_Message TEXT;
    p_MJAIAgentRuns_ConversationID_LastRunID UUID;
    p_MJAIAgentRuns_ConversationID_StartingPayload TEXT;
    p_MJAIAgentRuns_ConversationID_TotalPromptIterations INTEGER;
    p_MJAIAgentRuns_ConversationID_ConfigurationID UUID;
    p_MJAIAgentRuns_ConversationID_OverrideModelID UUID;
    p_MJAIAgentRuns_ConversationID_OverrideVendorID UUID;
    p_MJAIAgentRuns_ConversationID_Data TEXT;
    p_MJAIAgentRuns_ConversationID_Verbose BOOLEAN;
    p_MJAIAgentRuns_ConversationID_EffortLevel INTEGER;
    p_MJAIAgentRuns_ConversationID_RunName VARCHAR(255);
    p_MJAIAgentRuns_ConversationID_Comments TEXT;
    p_MJAIAgentRuns_ConversationID_ScheduledJobRunID UUID;
    p_MJAIAgentRuns_ConversationID_TestRunID UUID;
    p_MJAIAgentRuns_ConversationID_PrimaryScopeEntityID UUID;
    p_MJAIAgentRuns_ConversationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentRuns_ConversationID_SecondaryScopes TEXT;
    p_MJAIAgentRuns_ConversationID_ExternalReferenceID VARCHAR(200);
    p_MJAIAgentRuns_ConversationID_CompanyID UUID;
    p_MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_LastHeartbeatAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationID_AgentSessionID UUID;
    p_MJAIAgentSessions_ConversationIDID UUID;
    p_MJAIAgentSessions_ConversationID_AgentID UUID;
    p_MJAIAgentSessions_ConversationID_UserID UUID;
    p_MJAIAgentSessions_ConversationID_Status VARCHAR(20);
    p_MJAIAgentSessions_ConversationID_ConversationID UUID;
    p_MJAIAgentSessions_ConversationID_LastSessionID UUID;
    p_MJAIAgentSessions_ConversationID_HostInstanceID VARCHAR(200);
    p_MJAIAgentSessions_ConversationID_Config TEXT;
    p_MJAIAgentSessions_ConversationID_LastActiveAt TIMESTAMPTZ;
    p_MJAIAgentSessions_ConversationID_ClosedAt TIMESTAMPTZ;
    p_MJAIAgentSessions_ConversationID_CloseReason VARCHAR(20);
    p_MJAIAgentSessions_ConversationID_RecordingMedia VARCHAR(20);
    p_MJAIAgentSessions_ConversationID_RecordingStartedAt TIMESTAMPTZ;
    p_MJAIAgentSessions_ConversationID_RecordingFileID UUID;
    p_MJAIAgentSessions_ConversationID_LinkedEntityID UUID;
    p_MJAIAgentSessions_ConversationID_LinkedRecordID VARCHAR(500);
    p_MJConversationArtifacts_ConversationIDID UUID;
    p_MJConversationDetails_ConversationIDID UUID;
    p_MJConversations_LastConversationIDID UUID;
    p_MJConversations_LastConversationID_UserID UUID;
    p_MJConversations_LastConversationID_ExternalID VARCHAR(500);
    p_MJConversations_LastConversationID_Name VARCHAR(255);
    p_MJConversations_LastConversationID_Description TEXT;
    p_MJConversations_LastConversationID_Type VARCHAR(50);
    p_MJConversations_LastConversationID_IsArchived BOOLEAN;
    p_MJConversations_LastConversationID_LinkedEntityID UUID;
    p_MJConversations_LastConversationID_LinkedRecordID VARCHAR(500);
    p_MJConversations_LastConversationID_DataContextID UUID;
    p_MJConversations_LastConversationID_Status VARCHAR(20);
    p_MJConversations_LastConversationID_EnvironmentID UUID;
    p_MJConversations_LastConversationID_ProjectID UUID;
    p_MJConversations_LastConversationID_IsPinned BOOLEAN;
    p_MJConversations_LastConversationID_TestRunID UUID;
    p_MJConversations_LastConversationID_ApplicationScope VARCHAR(20);
    p_MJConversations_LastConversationID_ApplicationID UUID;
    p_MJConversations_LastConversationID_DefaultAgentID UUID;
    p_MJConversations_LastConversationID_AdditionalData TEXT;
    p_MJConversations_LastConversationID_RecordingFileID UUID;
    p_MJConversations_LastConversationID_EgressID VARCHAR(255);
    p_MJConversations_LastConversationID_VisitorKey VARCHAR(255);
    p_MJConversations_LastConversationID_LastConversationID UUID;
    p_MJReports_ConversationIDID UUID;
    p_MJReports_ConversationID_Name VARCHAR(255);
    p_MJReports_ConversationID_Description TEXT;
    p_MJReports_ConversationID_CategoryID UUID;
    p_MJReports_ConversationID_UserID UUID;
    p_MJReports_ConversationID_SharingScope VARCHAR(20);
    p_MJReports_ConversationID_ConversationID UUID;
    p_MJReports_ConversationID_ConversationDetailID UUID;
    p_MJReports_ConversationID_DataContextID UUID;
    p_MJReports_ConversationID_Configuration TEXT;
    p_MJReports_ConversationID_OutputTriggerTypeID UUID;
    p_MJReports_ConversationID_OutputFormatTypeID UUID;
    p_MJReports_ConversationID_OutputDeliveryTypeID UUID;
    p_MJReports_ConversationID_OutputFrequency VARCHAR(50);
    p_MJReports_ConversationID_OutputTargetEmail VARCHAR(255);
    p_MJReports_ConversationID_OutputWorkflowID UUID;
    p_MJReports_ConversationID_Thumbnail TEXT;
    p_MJReports_ConversationID_EnvironmentID UUID;
BEGIN
-- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample


    FOR _rec IN SELECT "ID", "AgentID", "UserID", "CompanyID", "Type", "ExampleInput", "ExampleOutput", "IsAutoGenerated", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "SuccessScore", "Comments", "Status", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt" FROM __mj."AIAgentExample" WHERE "SourceConversationID" = p_ID
    LOOP
        p_MJAIAgentExamples_SourceConversationIDID := _rec."ID";
        p_MJAIAgentExamples_SourceConversationID_AgentID := _rec."AgentID";
        p_MJAIAgentExamples_SourceConversationID_UserID := _rec."UserID";
        p_MJAIAgentExamples_SourceConversationID_CompanyID := _rec."CompanyID";
        p_MJAIAgentExamples_SourceConversationID_Type := _rec."Type";
        p_MJAIAgentExamples_SourceConversationID_ExampleInput := _rec."ExampleInput";
        p_MJAIAgentExamples_SourceConversationID_ExampleOutput := _rec."ExampleOutput";
        p_MJAIAgentExamples_SourceConversationID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentExamples_SourceConversationID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentExamples_SourceConversationID_SourceConversati_b98bb5 := _rec."SourceConversationDetailID";
        p_MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentExamples_SourceConversationID_SuccessScore := _rec."SuccessScore";
        p_MJAIAgentExamples_SourceConversationID_Comments := _rec."Comments";
        p_MJAIAgentExamples_SourceConversationID_Status := _rec."Status";
        p_MJAIAgentExamples_SourceConversationID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentExamples_SourceConversationID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentExamples_SourceConversationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentExamples_SourceConversationID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentExamples_SourceConversationID_AccessCount := _rec."AccessCount";
        p_MJAIAgentExamples_SourceConversationID_ExpiresAt := _rec."ExpiresAt";
        -- Set the FK field to NULL
        p_MJAIAgentExamples_SourceConversationID_SourceConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentExample"(p_ID => p_MJAIAgentExamples_SourceConversationIDID, p_AgentID => p_MJAIAgentExamples_SourceConversationID_AgentID, p_UserID => p_MJAIAgentExamples_SourceConversationID_UserID, p_CompanyID => p_MJAIAgentExamples_SourceConversationID_CompanyID, p_Type => p_MJAIAgentExamples_SourceConversationID_Type, p_ExampleInput => p_MJAIAgentExamples_SourceConversationID_ExampleInput, p_ExampleOutput => p_MJAIAgentExamples_SourceConversationID_ExampleOutput, p_IsAutoGenerated => p_MJAIAgentExamples_SourceConversationID_IsAutoGenerated, p_SourceConversationID_Clear => 1, p_SourceConversationID => p_MJAIAgentExamples_SourceConversationID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentExamples_SourceConversationID_SourceConversati_b98bb5, p_SourceAIAgentRunID => p_MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, p_SuccessScore => p_MJAIAgentExamples_SourceConversationID_SuccessScore, p_Comments => p_MJAIAgentExamples_SourceConversationID_Comments, p_Status => p_MJAIAgentExamples_SourceConversationID_Status, p_EmbeddingVector => p_MJAIAgentExamples_SourceConversationID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentExamples_SourceConversationID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentExamples_SourceConversationID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentExamples_SourceConversationID_LastAccessedAt, p_AccessCount => p_MJAIAgentExamples_SourceConversationID_AccessCount, p_ExpiresAt => p_MJAIAgentExamples_SourceConversationID_ExpiresAt);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore", "AuthorType" FROM __mj."AIAgentNote" WHERE "SourceConversationID" = p_ID
    LOOP
        p_MJAIAgentNotes_SourceConversationIDID := _rec."ID";
        p_MJAIAgentNotes_SourceConversationID_AgentID := _rec."AgentID";
        p_MJAIAgentNotes_SourceConversationID_AgentNoteTypeID := _rec."AgentNoteTypeID";
        p_MJAIAgentNotes_SourceConversationID_Note := _rec."Note";
        p_MJAIAgentNotes_SourceConversationID_UserID := _rec."UserID";
        p_MJAIAgentNotes_SourceConversationID_Type := _rec."Type";
        p_MJAIAgentNotes_SourceConversationID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentNotes_SourceConversationID_Comments := _rec."Comments";
        p_MJAIAgentNotes_SourceConversationID_Status := _rec."Status";
        p_MJAIAgentNotes_SourceConversationID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentNotes_SourceConversationID_SourceConversationD_de4992 := _rec."SourceConversationDetailID";
        p_MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentNotes_SourceConversationID_CompanyID := _rec."CompanyID";
        p_MJAIAgentNotes_SourceConversationID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentNotes_SourceConversationID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentNotes_SourceConversationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentNotes_SourceConversationID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentNotes_SourceConversationID_AccessCount := _rec."AccessCount";
        p_MJAIAgentNotes_SourceConversationID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID := _rec."ConsolidatedIntoNoteID";
        p_MJAIAgentNotes_SourceConversationID_ConsolidationCount := _rec."ConsolidationCount";
        p_MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs := _rec."DerivedFromNoteIDs";
        p_MJAIAgentNotes_SourceConversationID_ProtectionTier := _rec."ProtectionTier";
        p_MJAIAgentNotes_SourceConversationID_ImportanceScore := _rec."ImportanceScore";
        p_MJAIAgentNotes_SourceConversationID_AuthorType := _rec."AuthorType";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_SourceConversationID_SourceConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_SourceConversationIDID, p_AgentID => p_MJAIAgentNotes_SourceConversationID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_SourceConversationID_Note, p_UserID => p_MJAIAgentNotes_SourceConversationID_UserID, p_Type => p_MJAIAgentNotes_SourceConversationID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_SourceConversationID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_SourceConversationID_Comments, p_Status => p_MJAIAgentNotes_SourceConversationID_Status, p_SourceConversationID_Clear => 1, p_SourceConversationID => p_MJAIAgentNotes_SourceConversationID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentNotes_SourceConversationID_SourceConversationD_de4992, p_SourceAIAgentRunID => p_MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_SourceConversationID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_SourceConversationID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_SourceConversationID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentNotes_SourceConversationID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_SourceConversationID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_SourceConversationID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_SourceConversationID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, p_ConsolidationCount => p_MJAIAgentNotes_SourceConversationID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_SourceConversationID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_SourceConversationID_ImportanceScore, p_AuthorType => p_MJAIAgentNotes_SourceConversationID_AuthorType);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID" FROM __mj."AIAgentRun" WHERE "ConversationID" = p_ID
    LOOP
        p_MJAIAgentRuns_ConversationIDID := _rec."ID";
        p_MJAIAgentRuns_ConversationID_AgentID := _rec."AgentID";
        p_MJAIAgentRuns_ConversationID_ParentRunID := _rec."ParentRunID";
        p_MJAIAgentRuns_ConversationID_Status := _rec."Status";
        p_MJAIAgentRuns_ConversationID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRuns_ConversationID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRuns_ConversationID_Success := _rec."Success";
        p_MJAIAgentRuns_ConversationID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRuns_ConversationID_ConversationID := _rec."ConversationID";
        p_MJAIAgentRuns_ConversationID_UserID := _rec."UserID";
        p_MJAIAgentRuns_ConversationID_Result := _rec."Result";
        p_MJAIAgentRuns_ConversationID_AgentState := _rec."AgentState";
        p_MJAIAgentRuns_ConversationID_TotalTokensUsed := _rec."TotalTokensUsed";
        p_MJAIAgentRuns_ConversationID_TotalCost := _rec."TotalCost";
        p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsed := _rec."TotalPromptTokensUsed";
        p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed := _rec."TotalCompletionTokensUsed";
        p_MJAIAgentRuns_ConversationID_TotalTokensUsedRollup := _rec."TotalTokensUsedRollup";
        p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup := _rec."TotalPromptTokensUsedRollup";
        p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup := _rec."TotalCompletionTokensUsedRollup";
        p_MJAIAgentRuns_ConversationID_TotalCostRollup := _rec."TotalCostRollup";
        p_MJAIAgentRuns_ConversationID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJAIAgentRuns_ConversationID_ConversationDetailSequence := _rec."ConversationDetailSequence";
        p_MJAIAgentRuns_ConversationID_CancellationReason := _rec."CancellationReason";
        p_MJAIAgentRuns_ConversationID_FinalStep := _rec."FinalStep";
        p_MJAIAgentRuns_ConversationID_FinalPayload := _rec."FinalPayload";
        p_MJAIAgentRuns_ConversationID_Message := _rec."Message";
        p_MJAIAgentRuns_ConversationID_LastRunID := _rec."LastRunID";
        p_MJAIAgentRuns_ConversationID_StartingPayload := _rec."StartingPayload";
        p_MJAIAgentRuns_ConversationID_TotalPromptIterations := _rec."TotalPromptIterations";
        p_MJAIAgentRuns_ConversationID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIAgentRuns_ConversationID_OverrideModelID := _rec."OverrideModelID";
        p_MJAIAgentRuns_ConversationID_OverrideVendorID := _rec."OverrideVendorID";
        p_MJAIAgentRuns_ConversationID_Data := _rec."Data";
        p_MJAIAgentRuns_ConversationID_Verbose := _rec."Verbose";
        p_MJAIAgentRuns_ConversationID_EffortLevel := _rec."EffortLevel";
        p_MJAIAgentRuns_ConversationID_RunName := _rec."RunName";
        p_MJAIAgentRuns_ConversationID_Comments := _rec."Comments";
        p_MJAIAgentRuns_ConversationID_ScheduledJobRunID := _rec."ScheduledJobRunID";
        p_MJAIAgentRuns_ConversationID_TestRunID := _rec."TestRunID";
        p_MJAIAgentRuns_ConversationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentRuns_ConversationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentRuns_ConversationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentRuns_ConversationID_ExternalReferenceID := _rec."ExternalReferenceID";
        p_MJAIAgentRuns_ConversationID_CompanyID := _rec."CompanyID";
        p_MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed := _rec."TotalCacheReadTokensUsed";
        p_MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed := _rec."TotalCacheWriteTokensUsed";
        p_MJAIAgentRuns_ConversationID_LastHeartbeatAt := _rec."LastHeartbeatAt";
        p_MJAIAgentRuns_ConversationID_AgentSessionID := _rec."AgentSessionID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConversationIDID, p_AgentID => p_MJAIAgentRuns_ConversationID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConversationID_ParentRunID, p_Status => p_MJAIAgentRuns_ConversationID_Status, p_StartedAt => p_MJAIAgentRuns_ConversationID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConversationID_CompletedAt, p_Success => p_MJAIAgentRuns_ConversationID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConversationID_ErrorMessage, p_ConversationID_Clear => 1, p_ConversationID => p_MJAIAgentRuns_ConversationID_ConversationID, p_UserID => p_MJAIAgentRuns_ConversationID_UserID, p_Result => p_MJAIAgentRuns_ConversationID_Result, p_AgentState => p_MJAIAgentRuns_ConversationID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConversationID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConversationID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ConversationID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ConversationID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConversationID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConversationID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConversationID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConversationID_FinalPayload, p_Message => p_MJAIAgentRuns_ConversationID_Message, p_LastRunID => p_MJAIAgentRuns_ConversationID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConversationID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConversationID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ConversationID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConversationID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConversationID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConversationID_Data, p_Verbose => p_MJAIAgentRuns_ConversationID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConversationID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConversationID_RunName, p_Comments => p_MJAIAgentRuns_ConversationID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConversationID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConversationID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConversationID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConversationID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConversationID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ConversationID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ConversationID_AgentSessionID);

    END LOOP;

    
    -- Cascade update on AIAgentSession using cursor to call spUpdateAIAgentSession


    FOR _rec IN SELECT "ID", "AgentID", "UserID", "Status", "ConversationID", "LastSessionID", "HostInstanceID", "Config", "LastActiveAt", "ClosedAt", "CloseReason", "RecordingMedia", "RecordingStartedAt", "RecordingFileID", "LinkedEntityID", "LinkedRecordID" FROM __mj."AIAgentSession" WHERE "ConversationID" = p_ID
    LOOP
        p_MJAIAgentSessions_ConversationIDID := _rec."ID";
        p_MJAIAgentSessions_ConversationID_AgentID := _rec."AgentID";
        p_MJAIAgentSessions_ConversationID_UserID := _rec."UserID";
        p_MJAIAgentSessions_ConversationID_Status := _rec."Status";
        p_MJAIAgentSessions_ConversationID_ConversationID := _rec."ConversationID";
        p_MJAIAgentSessions_ConversationID_LastSessionID := _rec."LastSessionID";
        p_MJAIAgentSessions_ConversationID_HostInstanceID := _rec."HostInstanceID";
        p_MJAIAgentSessions_ConversationID_Config := _rec."Config";
        p_MJAIAgentSessions_ConversationID_LastActiveAt := _rec."LastActiveAt";
        p_MJAIAgentSessions_ConversationID_ClosedAt := _rec."ClosedAt";
        p_MJAIAgentSessions_ConversationID_CloseReason := _rec."CloseReason";
        p_MJAIAgentSessions_ConversationID_RecordingMedia := _rec."RecordingMedia";
        p_MJAIAgentSessions_ConversationID_RecordingStartedAt := _rec."RecordingStartedAt";
        p_MJAIAgentSessions_ConversationID_RecordingFileID := _rec."RecordingFileID";
        p_MJAIAgentSessions_ConversationID_LinkedEntityID := _rec."LinkedEntityID";
        p_MJAIAgentSessions_ConversationID_LinkedRecordID := _rec."LinkedRecordID";
        -- Set the FK field to NULL
        p_MJAIAgentSessions_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentSession"(p_ID => p_MJAIAgentSessions_ConversationIDID, p_AgentID => p_MJAIAgentSessions_ConversationID_AgentID, p_UserID => p_MJAIAgentSessions_ConversationID_UserID, p_Status => p_MJAIAgentSessions_ConversationID_Status, p_ConversationID_Clear => 1, p_ConversationID => p_MJAIAgentSessions_ConversationID_ConversationID, p_LastSessionID => p_MJAIAgentSessions_ConversationID_LastSessionID, p_HostInstanceID => p_MJAIAgentSessions_ConversationID_HostInstanceID, p_Config => p_MJAIAgentSessions_ConversationID_Config, p_LastActiveAt => p_MJAIAgentSessions_ConversationID_LastActiveAt, p_ClosedAt => p_MJAIAgentSessions_ConversationID_ClosedAt, p_CloseReason => p_MJAIAgentSessions_ConversationID_CloseReason, p_RecordingMedia => p_MJAIAgentSessions_ConversationID_RecordingMedia, p_RecordingStartedAt => p_MJAIAgentSessions_ConversationID_RecordingStartedAt, p_RecordingFileID => p_MJAIAgentSessions_ConversationID_RecordingFileID, p_LinkedEntityID => p_MJAIAgentSessions_ConversationID_LinkedEntityID, p_LinkedRecordID => p_MJAIAgentSessions_ConversationID_LinkedRecordID);

    END LOOP;

    
    -- Cascade delete from ConversationArtifact using cursor to call spDeleteConversationArtifact

    FOR _rec IN SELECT "ID" FROM __mj."ConversationArtifact" WHERE "ConversationID" = p_ID
    LOOP
        p_MJConversationArtifacts_ConversationIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationArtifact"(p_ID => p_MJConversationArtifacts_ConversationIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ConversationDetail using cursor to call spDeleteConversationDetail

    FOR _rec IN SELECT "ID" FROM __mj."ConversationDetail" WHERE "ConversationID" = p_ID
    LOOP
        p_MJConversationDetails_ConversationIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationDetail"(p_ID => p_MJConversationDetails_ConversationIDID);
        
    END LOOP;
    
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation


    FOR _rec IN SELECT "ID", "UserID", "ExternalID", "Name", "Description", "Type", "IsArchived", "LinkedEntityID", "LinkedRecordID", "DataContextID", "Status", "EnvironmentID", "ProjectID", "IsPinned", "TestRunID", "ApplicationScope", "ApplicationID", "DefaultAgentID", "AdditionalData", "RecordingFileID", "EgressID", "VisitorKey", "LastConversationID" FROM __mj."Conversation" WHERE "LastConversationID" = p_ID
    LOOP
        p_MJConversations_LastConversationIDID := _rec."ID";
        p_MJConversations_LastConversationID_UserID := _rec."UserID";
        p_MJConversations_LastConversationID_ExternalID := _rec."ExternalID";
        p_MJConversations_LastConversationID_Name := _rec."Name";
        p_MJConversations_LastConversationID_Description := _rec."Description";
        p_MJConversations_LastConversationID_Type := _rec."Type";
        p_MJConversations_LastConversationID_IsArchived := _rec."IsArchived";
        p_MJConversations_LastConversationID_LinkedEntityID := _rec."LinkedEntityID";
        p_MJConversations_LastConversationID_LinkedRecordID := _rec."LinkedRecordID";
        p_MJConversations_LastConversationID_DataContextID := _rec."DataContextID";
        p_MJConversations_LastConversationID_Status := _rec."Status";
        p_MJConversations_LastConversationID_EnvironmentID := _rec."EnvironmentID";
        p_MJConversations_LastConversationID_ProjectID := _rec."ProjectID";
        p_MJConversations_LastConversationID_IsPinned := _rec."IsPinned";
        p_MJConversations_LastConversationID_TestRunID := _rec."TestRunID";
        p_MJConversations_LastConversationID_ApplicationScope := _rec."ApplicationScope";
        p_MJConversations_LastConversationID_ApplicationID := _rec."ApplicationID";
        p_MJConversations_LastConversationID_DefaultAgentID := _rec."DefaultAgentID";
        p_MJConversations_LastConversationID_AdditionalData := _rec."AdditionalData";
        p_MJConversations_LastConversationID_RecordingFileID := _rec."RecordingFileID";
        p_MJConversations_LastConversationID_EgressID := _rec."EgressID";
        p_MJConversations_LastConversationID_VisitorKey := _rec."VisitorKey";
        p_MJConversations_LastConversationID_LastConversationID := _rec."LastConversationID";
        -- Set the FK field to NULL
        p_MJConversations_LastConversationID_LastConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversation"(p_ID => p_MJConversations_LastConversationIDID, p_UserID => p_MJConversations_LastConversationID_UserID, p_ExternalID => p_MJConversations_LastConversationID_ExternalID, p_Name => p_MJConversations_LastConversationID_Name, p_Description => p_MJConversations_LastConversationID_Description, p_Type => p_MJConversations_LastConversationID_Type, p_IsArchived => p_MJConversations_LastConversationID_IsArchived, p_LinkedEntityID => p_MJConversations_LastConversationID_LinkedEntityID, p_LinkedRecordID => p_MJConversations_LastConversationID_LinkedRecordID, p_DataContextID => p_MJConversations_LastConversationID_DataContextID, p_Status => p_MJConversations_LastConversationID_Status, p_EnvironmentID => p_MJConversations_LastConversationID_EnvironmentID, p_ProjectID => p_MJConversations_LastConversationID_ProjectID, p_IsPinned => p_MJConversations_LastConversationID_IsPinned, p_TestRunID => p_MJConversations_LastConversationID_TestRunID, p_ApplicationScope => p_MJConversations_LastConversationID_ApplicationScope, p_ApplicationID => p_MJConversations_LastConversationID_ApplicationID, p_DefaultAgentID => p_MJConversations_LastConversationID_DefaultAgentID, p_AdditionalData => p_MJConversations_LastConversationID_AdditionalData, p_RecordingFileID => p_MJConversations_LastConversationID_RecordingFileID, p_EgressID => p_MJConversations_LastConversationID_EgressID, p_VisitorKey => p_MJConversations_LastConversationID_VisitorKey, p_LastConversationID_Clear => 1, p_LastConversationID => p_MJConversations_LastConversationID_LastConversationID);

    END LOOP;

    
    -- Cascade update on Report using cursor to call spUpdateReport


    FOR _rec IN SELECT "ID", "Name", "Description", "CategoryID", "UserID", "SharingScope", "ConversationID", "ConversationDetailID", "DataContextID", "Configuration", "OutputTriggerTypeID", "OutputFormatTypeID", "OutputDeliveryTypeID", "OutputFrequency", "OutputTargetEmail", "OutputWorkflowID", "Thumbnail", "EnvironmentID" FROM __mj."Report" WHERE "ConversationID" = p_ID
    LOOP
        p_MJReports_ConversationIDID := _rec."ID";
        p_MJReports_ConversationID_Name := _rec."Name";
        p_MJReports_ConversationID_Description := _rec."Description";
        p_MJReports_ConversationID_CategoryID := _rec."CategoryID";
        p_MJReports_ConversationID_UserID := _rec."UserID";
        p_MJReports_ConversationID_SharingScope := _rec."SharingScope";
        p_MJReports_ConversationID_ConversationID := _rec."ConversationID";
        p_MJReports_ConversationID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJReports_ConversationID_DataContextID := _rec."DataContextID";
        p_MJReports_ConversationID_Configuration := _rec."Configuration";
        p_MJReports_ConversationID_OutputTriggerTypeID := _rec."OutputTriggerTypeID";
        p_MJReports_ConversationID_OutputFormatTypeID := _rec."OutputFormatTypeID";
        p_MJReports_ConversationID_OutputDeliveryTypeID := _rec."OutputDeliveryTypeID";
        p_MJReports_ConversationID_OutputFrequency := _rec."OutputFrequency";
        p_MJReports_ConversationID_OutputTargetEmail := _rec."OutputTargetEmail";
        p_MJReports_ConversationID_OutputWorkflowID := _rec."OutputWorkflowID";
        p_MJReports_ConversationID_Thumbnail := _rec."Thumbnail";
        p_MJReports_ConversationID_EnvironmentID := _rec."EnvironmentID";
        -- Set the FK field to NULL
        p_MJReports_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateReport"(p_ID => p_MJReports_ConversationIDID, p_Name => p_MJReports_ConversationID_Name, p_Description => p_MJReports_ConversationID_Description, p_CategoryID => p_MJReports_ConversationID_CategoryID, p_UserID => p_MJReports_ConversationID_UserID, p_SharingScope => p_MJReports_ConversationID_SharingScope, p_ConversationID_Clear => 1, p_ConversationID => p_MJReports_ConversationID_ConversationID, p_ConversationDetailID => p_MJReports_ConversationID_ConversationDetailID, p_DataContextID => p_MJReports_ConversationID_DataContextID, p_Configuration => p_MJReports_ConversationID_Configuration, p_OutputTriggerTypeID => p_MJReports_ConversationID_OutputTriggerTypeID, p_OutputFormatTypeID => p_MJReports_ConversationID_OutputFormatTypeID, p_OutputDeliveryTypeID => p_MJReports_ConversationID_OutputDeliveryTypeID, p_OutputFrequency => p_MJReports_ConversationID_OutputFrequency, p_OutputTargetEmail => p_MJReports_ConversationID_OutputTargetEmail, p_OutputWorkflowID => p_MJReports_ConversationID_OutputWorkflowID, p_Thumbnail => p_MJReports_ConversationID_Thumbnail, p_EnvironmentID => p_MJReports_ConversationID_EnvironmentID);

    END LOOP;

    

    DELETE FROM
        __mj."Conversation"
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
           WHERE proname = 'spDeleteAIAgent'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgent"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJActions_CreatedByAgentIDID UUID;
    p_MJActions_CreatedByAgentID_CategoryID UUID;
    p_MJActions_CreatedByAgentID_Name VARCHAR(425);
    p_MJActions_CreatedByAgentID_Description TEXT;
    p_MJActions_CreatedByAgentID_Type VARCHAR(20);
    p_MJActions_CreatedByAgentID_UserPrompt TEXT;
    p_MJActions_CreatedByAgentID_UserComments TEXT;
    p_MJActions_CreatedByAgentID_Code TEXT;
    p_MJActions_CreatedByAgentID_CodeComments TEXT;
    p_MJActions_CreatedByAgentID_CodeApprovalStatus VARCHAR(20);
    p_MJActions_CreatedByAgentID_CodeApprovalComments TEXT;
    p_MJActions_CreatedByAgentID_CodeApprovedByUserID UUID;
    p_MJActions_CreatedByAgentID_CodeApprovedAt TIMESTAMPTZ;
    p_MJActions_CreatedByAgentID_CodeLocked BOOLEAN;
    p_MJActions_CreatedByAgentID_ForceCodeGeneration BOOLEAN;
    p_MJActions_CreatedByAgentID_RetentionPeriod INTEGER;
    p_MJActions_CreatedByAgentID_Status VARCHAR(20);
    p_MJActions_CreatedByAgentID_DriverClass VARCHAR(255);
    p_MJActions_CreatedByAgentID_ParentID UUID;
    p_MJActions_CreatedByAgentID_IconClass VARCHAR(100);
    p_MJActions_CreatedByAgentID_DefaultCompactPromptID UUID;
    p_MJActions_CreatedByAgentID_Config TEXT;
    p_MJActions_CreatedByAgentID_RuntimeActionConfiguration TEXT;
    p_MJActions_CreatedByAgentID_MaxExecutionTimeMS INTEGER;
    p_MJActions_CreatedByAgentID_CreatedByAgentID UUID;
    p_MJAIAgentActions_AgentIDID UUID;
    p_MJAIAgentActions_AgentID_AgentID UUID;
    p_MJAIAgentActions_AgentID_ActionID UUID;
    p_MJAIAgentActions_AgentID_Status VARCHAR(15);
    p_MJAIAgentActions_AgentID_MinExecutionsPerRun INTEGER;
    p_MJAIAgentActions_AgentID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgentActions_AgentID_ResultExpirationTurns INTEGER;
    p_MJAIAgentActions_AgentID_ResultExpirationMode VARCHAR(20);
    p_MJAIAgentActions_AgentID_CompactMode VARCHAR(20);
    p_MJAIAgentActions_AgentID_CompactLength INTEGER;
    p_MJAIAgentActions_AgentID_CompactPromptID UUID;
    p_MJAIAgentArtifactTypes_AgentIDID UUID;
    p_MJAIAgentClientTools_AgentIDID UUID;
    p_MJAIAgentCoAgents_CoAgentIDID UUID;
    p_MJAIAgentCoAgents_TargetAgentIDID UUID;
    p_MJAIAgentCoAgents_TargetAgentID_CoAgentID UUID;
    p_MJAIAgentCoAgents_TargetAgentID_TargetAgentID UUID;
    p_MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID UUID;
    p_MJAIAgentCoAgents_TargetAgentID_Type VARCHAR(30);
    p_MJAIAgentCoAgents_TargetAgentID_IsDefault BOOLEAN;
    p_MJAIAgentCoAgents_TargetAgentID_Sequence INTEGER;
    p_MJAIAgentCoAgents_TargetAgentID_Status VARCHAR(20);
    p_MJAIAgentCoAgents_TargetAgentID_Configuration TEXT;
    p_MJAIAgentConfigurations_AgentIDID UUID;
    p_MJAIAgentDataSources_AgentIDID UUID;
    p_MJAIAgentExamples_AgentIDID UUID;
    p_MJAIAgentLearningCycles_AgentIDID UUID;
    p_MJAIAgentModalities_AgentIDID UUID;
    p_MJAIAgentModels_AgentIDID UUID;
    p_MJAIAgentModels_AgentID_AgentID UUID;
    p_MJAIAgentModels_AgentID_ModelID UUID;
    p_MJAIAgentModels_AgentID_Active BOOLEAN;
    p_MJAIAgentModels_AgentID_Priority INTEGER;
    p_MJAIAgentNotes_AgentIDID UUID;
    p_MJAIAgentNotes_AgentID_AgentID UUID;
    p_MJAIAgentNotes_AgentID_AgentNoteTypeID UUID;
    p_MJAIAgentNotes_AgentID_Note TEXT;
    p_MJAIAgentNotes_AgentID_UserID UUID;
    p_MJAIAgentNotes_AgentID_Type VARCHAR(20);
    p_MJAIAgentNotes_AgentID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentNotes_AgentID_Comments TEXT;
    p_MJAIAgentNotes_AgentID_Status VARCHAR(20);
    p_MJAIAgentNotes_AgentID_SourceConversationID UUID;
    p_MJAIAgentNotes_AgentID_SourceConversationDetailID UUID;
    p_MJAIAgentNotes_AgentID_SourceAIAgentRunID UUID;
    p_MJAIAgentNotes_AgentID_CompanyID UUID;
    p_MJAIAgentNotes_AgentID_EmbeddingVector TEXT;
    p_MJAIAgentNotes_AgentID_EmbeddingModelID UUID;
    p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID UUID;
    p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentNotes_AgentID_SecondaryScopes TEXT;
    p_MJAIAgentNotes_AgentID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentNotes_AgentID_AccessCount INTEGER;
    p_MJAIAgentNotes_AgentID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID UUID;
    p_MJAIAgentNotes_AgentID_ConsolidationCount INTEGER;
    p_MJAIAgentNotes_AgentID_DerivedFromNoteIDs TEXT;
    p_MJAIAgentNotes_AgentID_ProtectionTier VARCHAR(20);
    p_MJAIAgentNotes_AgentID_ImportanceScore NUMERIC(5,2);
    p_MJAIAgentNotes_AgentID_AuthorType VARCHAR(20);
    p_MJAIAgentPermissions_AgentIDID UUID;
    p_MJAIAgentPrompts_AgentIDID UUID;
    p_MJAIAgentRelationships_AgentIDID UUID;
    p_MJAIAgentRelationships_SubAgentIDID UUID;
    p_MJAIAgentRequests_AgentIDID UUID;
    p_MJAIAgentRuns_AgentIDID UUID;
    p_MJAIAgentSearchScopes_AgentIDID UUID;
    p_MJAIAgentSessions_AgentIDID UUID;
    p_MJAIAgentSteps_AgentIDID UUID;
    p_MJAIAgentSteps_SubAgentIDID UUID;
    p_MJAIAgentSteps_SubAgentID_AgentID UUID;
    p_MJAIAgentSteps_SubAgentID_Name VARCHAR(255);
    p_MJAIAgentSteps_SubAgentID_Description TEXT;
    p_MJAIAgentSteps_SubAgentID_StepType VARCHAR(20);
    p_MJAIAgentSteps_SubAgentID_StartingStep BOOLEAN;
    p_MJAIAgentSteps_SubAgentID_TimeoutSeconds INTEGER;
    p_MJAIAgentSteps_SubAgentID_RetryCount INTEGER;
    p_MJAIAgentSteps_SubAgentID_OnErrorBehavior VARCHAR(20);
    p_MJAIAgentSteps_SubAgentID_ActionID UUID;
    p_MJAIAgentSteps_SubAgentID_SubAgentID UUID;
    p_MJAIAgentSteps_SubAgentID_PromptID UUID;
    p_MJAIAgentSteps_SubAgentID_ActionOutputMapping TEXT;
    p_MJAIAgentSteps_SubAgentID_PositionX INTEGER;
    p_MJAIAgentSteps_SubAgentID_PositionY INTEGER;
    p_MJAIAgentSteps_SubAgentID_Width INTEGER;
    p_MJAIAgentSteps_SubAgentID_Height INTEGER;
    p_MJAIAgentSteps_SubAgentID_Status VARCHAR(20);
    p_MJAIAgentSteps_SubAgentID_ActionInputMapping TEXT;
    p_MJAIAgentSteps_SubAgentID_LoopBodyType VARCHAR(50);
    p_MJAIAgentSteps_SubAgentID_Configuration TEXT;
    p_MJAIAgents_ParentIDID UUID;
    p_MJAIAgents_ParentID_Name VARCHAR(255);
    p_MJAIAgents_ParentID_Description TEXT;
    p_MJAIAgents_ParentID_LogoURL VARCHAR(255);
    p_MJAIAgents_ParentID_ParentID UUID;
    p_MJAIAgents_ParentID_ExposeAsAction BOOLEAN;
    p_MJAIAgents_ParentID_ExecutionOrder INTEGER;
    p_MJAIAgents_ParentID_ExecutionMode VARCHAR(20);
    p_MJAIAgents_ParentID_EnableContextCompression BOOLEAN;
    p_MJAIAgents_ParentID_ContextCompressionMessageThreshold INTEGER;
    p_MJAIAgents_ParentID_ContextCompressionPromptID UUID;
    p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount INTEGER;
    p_MJAIAgents_ParentID_TypeID UUID;
    p_MJAIAgents_ParentID_Status VARCHAR(20);
    p_MJAIAgents_ParentID_DriverClass VARCHAR(255);
    p_MJAIAgents_ParentID_IconClass VARCHAR(100);
    p_MJAIAgents_ParentID_ModelSelectionMode VARCHAR(50);
    p_MJAIAgents_ParentID_PayloadDownstreamPaths TEXT;
    p_MJAIAgents_ParentID_PayloadUpstreamPaths TEXT;
    p_MJAIAgents_ParentID_PayloadSelfReadPaths TEXT;
    p_MJAIAgents_ParentID_PayloadSelfWritePaths TEXT;
    p_MJAIAgents_ParentID_PayloadScope TEXT;
    p_MJAIAgents_ParentID_FinalPayloadValidation TEXT;
    p_MJAIAgents_ParentID_FinalPayloadValidationMode VARCHAR(25);
    p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries INTEGER;
    p_MJAIAgents_ParentID_MaxCostPerRun NUMERIC(10,4);
    p_MJAIAgents_ParentID_MaxTokensPerRun INTEGER;
    p_MJAIAgents_ParentID_MaxIterationsPerRun INTEGER;
    p_MJAIAgents_ParentID_MaxTimePerRun INTEGER;
    p_MJAIAgents_ParentID_MinExecutionsPerRun INTEGER;
    p_MJAIAgents_ParentID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgents_ParentID_StartingPayloadValidation TEXT;
    p_MJAIAgents_ParentID_StartingPayloadValidationMode VARCHAR(25);
    p_MJAIAgents_ParentID_DefaultPromptEffortLevel INTEGER;
    p_MJAIAgents_ParentID_ChatHandlingOption VARCHAR(30);
    p_MJAIAgents_ParentID_DefaultArtifactTypeID UUID;
    p_MJAIAgents_ParentID_OwnerUserID UUID;
    p_MJAIAgents_ParentID_InvocationMode VARCHAR(20);
    p_MJAIAgents_ParentID_ArtifactCreationMode VARCHAR(20);
    p_MJAIAgents_ParentID_FunctionalRequirements TEXT;
    p_MJAIAgents_ParentID_TechnicalDesign TEXT;
    p_MJAIAgents_ParentID_InjectNotes BOOLEAN;
    p_MJAIAgents_ParentID_MaxNotesToInject INTEGER;
    p_MJAIAgents_ParentID_NoteInjectionStrategy VARCHAR(20);
    p_MJAIAgents_ParentID_InjectExamples BOOLEAN;
    p_MJAIAgents_ParentID_MaxExamplesToInject INTEGER;
    p_MJAIAgents_ParentID_ExampleInjectionStrategy VARCHAR(20);
    p_MJAIAgents_ParentID_IsRestricted BOOLEAN;
    p_MJAIAgents_ParentID_MessageMode VARCHAR(50);
    p_MJAIAgents_ParentID_MaxMessages INTEGER;
    p_MJAIAgents_ParentID_AttachmentStorageProviderID UUID;
    p_MJAIAgents_ParentID_AttachmentRootPath VARCHAR(500);
    p_MJAIAgents_ParentID_InlineStorageThresholdBytes INTEGER;
    p_MJAIAgents_ParentID_AgentTypePromptParams TEXT;
    p_MJAIAgents_ParentID_ScopeConfig TEXT;
    p_MJAIAgents_ParentID_NoteRetentionDays INTEGER;
    p_MJAIAgents_ParentID_ExampleRetentionDays INTEGER;
    p_MJAIAgents_ParentID_AutoArchiveEnabled BOOLEAN;
    p_MJAIAgents_ParentID_RerankerConfiguration TEXT;
    p_MJAIAgents_ParentID_CategoryID UUID;
    p_MJAIAgents_ParentID_AllowEphemeralClientTools BOOLEAN;
    p_MJAIAgents_ParentID_DefaultStorageAccountID UUID;
    p_MJAIAgents_ParentID_SearchScopeAccess VARCHAR(20);
    p_MJAIAgents_ParentID_AcceptUnregisteredFiles BOOLEAN;
    p_MJAIAgents_ParentID_DefaultCoAgentID UUID;
    p_MJAIAgents_ParentID_TypeConfiguration TEXT;
    p_MJAIAgents_ParentID_AllowMemoryWrite BOOLEAN;
    p_MJAIAgents_ParentID_RecordingDefault VARCHAR(20);
    p_MJAIAgents_ParentID_RecordingStorageProviderID UUID;
    p_MJAIAgents_ParentID_DefaultMediaCollectionID UUID;
    p_MJAIAgents_DefaultCoAgentIDID UUID;
    p_MJAIAgents_DefaultCoAgentID_Name VARCHAR(255);
    p_MJAIAgents_DefaultCoAgentID_Description TEXT;
    p_MJAIAgents_DefaultCoAgentID_LogoURL VARCHAR(255);
    p_MJAIAgents_DefaultCoAgentID_ParentID UUID;
    p_MJAIAgents_DefaultCoAgentID_ExposeAsAction BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_ExecutionOrder INTEGER;
    p_MJAIAgents_DefaultCoAgentID_ExecutionMode VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_EnableContextCompression BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageTh_2ba4d7 INTEGER;
    p_MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID UUID;
    p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRe_601f1d INTEGER;
    p_MJAIAgents_DefaultCoAgentID_TypeID UUID;
    p_MJAIAgents_DefaultCoAgentID_Status VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_DriverClass VARCHAR(255);
    p_MJAIAgents_DefaultCoAgentID_IconClass VARCHAR(100);
    p_MJAIAgents_DefaultCoAgentID_ModelSelectionMode VARCHAR(50);
    p_MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths TEXT;
    p_MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths TEXT;
    p_MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths TEXT;
    p_MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths TEXT;
    p_MJAIAgents_DefaultCoAgentID_PayloadScope TEXT;
    p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidation TEXT;
    p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode VARCHAR(25);
    p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries INTEGER;
    p_MJAIAgents_DefaultCoAgentID_MaxCostPerRun NUMERIC(10,4);
    p_MJAIAgents_DefaultCoAgentID_MaxTokensPerRun INTEGER;
    p_MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun INTEGER;
    p_MJAIAgents_DefaultCoAgentID_MaxTimePerRun INTEGER;
    p_MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun INTEGER;
    p_MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidation TEXT;
    p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode VARCHAR(25);
    p_MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel INTEGER;
    p_MJAIAgents_DefaultCoAgentID_ChatHandlingOption VARCHAR(30);
    p_MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID UUID;
    p_MJAIAgents_DefaultCoAgentID_OwnerUserID UUID;
    p_MJAIAgents_DefaultCoAgentID_InvocationMode VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_ArtifactCreationMode VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_FunctionalRequirements TEXT;
    p_MJAIAgents_DefaultCoAgentID_TechnicalDesign TEXT;
    p_MJAIAgents_DefaultCoAgentID_InjectNotes BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_MaxNotesToInject INTEGER;
    p_MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_InjectExamples BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_MaxExamplesToInject INTEGER;
    p_MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_IsRestricted BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_MessageMode VARCHAR(50);
    p_MJAIAgents_DefaultCoAgentID_MaxMessages INTEGER;
    p_MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID UUID;
    p_MJAIAgents_DefaultCoAgentID_AttachmentRootPath VARCHAR(500);
    p_MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes INTEGER;
    p_MJAIAgents_DefaultCoAgentID_AgentTypePromptParams TEXT;
    p_MJAIAgents_DefaultCoAgentID_ScopeConfig TEXT;
    p_MJAIAgents_DefaultCoAgentID_NoteRetentionDays INTEGER;
    p_MJAIAgents_DefaultCoAgentID_ExampleRetentionDays INTEGER;
    p_MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_RerankerConfiguration TEXT;
    p_MJAIAgents_DefaultCoAgentID_CategoryID UUID;
    p_MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID UUID;
    p_MJAIAgents_DefaultCoAgentID_SearchScopeAccess VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_DefaultCoAgentID UUID;
    p_MJAIAgents_DefaultCoAgentID_TypeConfiguration TEXT;
    p_MJAIAgents_DefaultCoAgentID_AllowMemoryWrite BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_RecordingDefault VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID UUID;
    p_MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID UUID;
    p_MJAIBridgeAgentIdentities_AgentIDID UUID;
    p_MJAIPromptRuns_AgentIDID UUID;
    p_MJAIPromptRuns_AgentID_PromptID UUID;
    p_MJAIPromptRuns_AgentID_ModelID UUID;
    p_MJAIPromptRuns_AgentID_VendorID UUID;
    p_MJAIPromptRuns_AgentID_AgentID UUID;
    p_MJAIPromptRuns_AgentID_ConfigurationID UUID;
    p_MJAIPromptRuns_AgentID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_AgentID_Messages TEXT;
    p_MJAIPromptRuns_AgentID_Result TEXT;
    p_MJAIPromptRuns_AgentID_TokensUsed INTEGER;
    p_MJAIPromptRuns_AgentID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_AgentID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_AgentID_Success BOOLEAN;
    p_MJAIPromptRuns_AgentID_ErrorMessage TEXT;
    p_MJAIPromptRuns_AgentID_ParentID UUID;
    p_MJAIPromptRuns_AgentID_RunType VARCHAR(20);
    p_MJAIPromptRuns_AgentID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_AgentID_AgentRunID UUID;
    p_MJAIPromptRuns_AgentID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_AgentID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_AgentID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_AgentID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_AgentID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_TopK INTEGER;
    p_MJAIPromptRuns_AgentID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_Seed INTEGER;
    p_MJAIPromptRuns_AgentID_StopSequences TEXT;
    p_MJAIPromptRuns_AgentID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_AgentID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_AgentID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_AgentID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_AgentID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_AgentID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_AgentID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_AgentID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_AgentID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_AgentID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_AgentID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_AgentID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_AgentID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_AgentID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_AgentID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_AgentID_ValidationSummary TEXT;
    p_MJAIPromptRuns_AgentID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_AgentID_FailoverErrors TEXT;
    p_MJAIPromptRuns_AgentID_FailoverDurations TEXT;
    p_MJAIPromptRuns_AgentID_OriginalModelID UUID;
    p_MJAIPromptRuns_AgentID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_AgentID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_AgentID_ModelSelection TEXT;
    p_MJAIPromptRuns_AgentID_Status VARCHAR(50);
    p_MJAIPromptRuns_AgentID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_AgentID_CancellationReason TEXT;
    p_MJAIPromptRuns_AgentID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_AgentID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_AgentID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_AgentID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_AgentID_JudgeID UUID;
    p_MJAIPromptRuns_AgentID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_AgentID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_AgentID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_AgentID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_AgentID_ErrorDetails TEXT;
    p_MJAIPromptRuns_AgentID_ChildPromptID UUID;
    p_MJAIPromptRuns_AgentID_QueueTime INTEGER;
    p_MJAIPromptRuns_AgentID_PromptTime INTEGER;
    p_MJAIPromptRuns_AgentID_CompletionTime INTEGER;
    p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_AgentID_EffortLevel INTEGER;
    p_MJAIPromptRuns_AgentID_RunName VARCHAR(255);
    p_MJAIPromptRuns_AgentID_Comments TEXT;
    p_MJAIPromptRuns_AgentID_TestRunID UUID;
    p_MJAIPromptRuns_AgentID_AssistantPrefill TEXT;
    p_MJAIPromptRuns_AgentID_TokensCacheRead INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCacheWrite INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCacheReadRollup INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCacheWriteRollup INTEGER;
    p_MJAIResultCache_AgentIDID UUID;
    p_MJAIResultCache_AgentID_AIPromptID UUID;
    p_MJAIResultCache_AgentID_AIModelID UUID;
    p_MJAIResultCache_AgentID_RunAt TIMESTAMPTZ;
    p_MJAIResultCache_AgentID_PromptText TEXT;
    p_MJAIResultCache_AgentID_ResultText TEXT;
    p_MJAIResultCache_AgentID_Status VARCHAR(50);
    p_MJAIResultCache_AgentID_ExpiredOn TIMESTAMPTZ;
    p_MJAIResultCache_AgentID_VendorID UUID;
    p_MJAIResultCache_AgentID_AgentID UUID;
    p_MJAIResultCache_AgentID_ConfigurationID UUID;
    p_MJAIResultCache_AgentID_PromptEmbedding BYTEA;
    p_MJAIResultCache_AgentID_PromptRunID UUID;
    p_MJConversationDetails_AgentIDID UUID;
    p_MJConversationDetails_AgentID_ConversationID UUID;
    p_MJConversationDetails_AgentID_ExternalID VARCHAR(100);
    p_MJConversationDetails_AgentID_Role VARCHAR(20);
    p_MJConversationDetails_AgentID_Message TEXT;
    p_MJConversationDetails_AgentID_Error TEXT;
    p_MJConversationDetails_AgentID_HiddenToUser BOOLEAN;
    p_MJConversationDetails_AgentID_UserRating INTEGER;
    p_MJConversationDetails_AgentID_UserFeedback TEXT;
    p_MJConversationDetails_AgentID_ReflectionInsights TEXT;
    p_MJConversationDetails_AgentID_SummaryOfEarlierConversation TEXT;
    p_MJConversationDetails_AgentID_UserID UUID;
    p_MJConversationDetails_AgentID_ArtifactID UUID;
    p_MJConversationDetails_AgentID_ArtifactVersionID UUID;
    p_MJConversationDetails_AgentID_CompletionTime BIGINT;
    p_MJConversationDetails_AgentID_IsPinned BOOLEAN;
    p_MJConversationDetails_AgentID_ParentID UUID;
    p_MJConversationDetails_AgentID_AgentID UUID;
    p_MJConversationDetails_AgentID_Status VARCHAR(20);
    p_MJConversationDetails_AgentID_SuggestedResponses TEXT;
    p_MJConversationDetails_AgentID_TestRunID UUID;
    p_MJConversationDetails_AgentID_ResponseForm TEXT;
    p_MJConversationDetails_AgentID_ActionableCommands TEXT;
    p_MJConversationDetails_AgentID_AutomaticCommands TEXT;
    p_MJConversationDetails_AgentID_OriginalMessageChanged BOOLEAN;
    p_MJConversationDetails_AgentID_AgentSessionID UUID;
    p_MJConversationDetails_AgentID_TurnEndedAt TIMESTAMPTZ;
    p_MJConversationDetails_AgentID_UtteranceStartMs INTEGER;
    p_MJConversationDetails_AgentID_UtteranceEndMs INTEGER;
    p_MJConversationDetails_AgentID_MediaType VARCHAR(20);
    p_MJConversationWidgetInstances_PinnedAgentIDID UUID;
    p_MJConversations_DefaultAgentIDID UUID;
    p_MJConversations_DefaultAgentID_UserID UUID;
    p_MJConversations_DefaultAgentID_ExternalID VARCHAR(500);
    p_MJConversations_DefaultAgentID_Name VARCHAR(255);
    p_MJConversations_DefaultAgentID_Description TEXT;
    p_MJConversations_DefaultAgentID_Type VARCHAR(50);
    p_MJConversations_DefaultAgentID_IsArchived BOOLEAN;
    p_MJConversations_DefaultAgentID_LinkedEntityID UUID;
    p_MJConversations_DefaultAgentID_LinkedRecordID VARCHAR(500);
    p_MJConversations_DefaultAgentID_DataContextID UUID;
    p_MJConversations_DefaultAgentID_Status VARCHAR(20);
    p_MJConversations_DefaultAgentID_EnvironmentID UUID;
    p_MJConversations_DefaultAgentID_ProjectID UUID;
    p_MJConversations_DefaultAgentID_IsPinned BOOLEAN;
    p_MJConversations_DefaultAgentID_TestRunID UUID;
    p_MJConversations_DefaultAgentID_ApplicationScope VARCHAR(20);
    p_MJConversations_DefaultAgentID_ApplicationID UUID;
    p_MJConversations_DefaultAgentID_DefaultAgentID UUID;
    p_MJConversations_DefaultAgentID_AdditionalData TEXT;
    p_MJConversations_DefaultAgentID_RecordingFileID UUID;
    p_MJConversations_DefaultAgentID_EgressID VARCHAR(255);
    p_MJConversations_DefaultAgentID_VisitorKey VARCHAR(255);
    p_MJConversations_DefaultAgentID_LastConversationID UUID;
    p_MJEntityDocuments_ReasoningAgentIDID UUID;
    p_MJEntityDocuments_ReasoningAgentID_Name VARCHAR(250);
    p_MJEntityDocuments_ReasoningAgentID_TypeID UUID;
    p_MJEntityDocuments_ReasoningAgentID_EntityID UUID;
    p_MJEntityDocuments_ReasoningAgentID_VectorDatabaseID UUID;
    p_MJEntityDocuments_ReasoningAgentID_Status VARCHAR(15);
    p_MJEntityDocuments_ReasoningAgentID_TemplateID UUID;
    p_MJEntityDocuments_ReasoningAgentID_AIModelID UUID;
    p_MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold NUMERIC(12,11);
    p_MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold NUMERIC(12,11);
    p_MJEntityDocuments_ReasoningAgentID_VectorIndexID UUID;
    p_MJEntityDocuments_ReasoningAgentID_Configuration TEXT;
    p_MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning BOOLEAN;
    p_MJEntityDocuments_ReasoningAgentID_ReasoningMode VARCHAR(20);
    p_MJEntityDocuments_ReasoningAgentID_ReasoningThreshold NUMERIC(12,11);
    p_MJEntityDocuments_ReasoningAgentID_ReasoningPromptID UUID;
    p_MJEntityDocuments_ReasoningAgentID_ReasoningAgentID UUID;
    p_MJEntityDocuments_ReasoningAgentID_AutomationLevel VARCHAR(30);
    p_MJRecordProcesses_AgentIDID UUID;
    p_MJRecordProcesses_AgentID_Name VARCHAR(255);
    p_MJRecordProcesses_AgentID_Description TEXT;
    p_MJRecordProcesses_AgentID_CategoryID UUID;
    p_MJRecordProcesses_AgentID_EntityID UUID;
    p_MJRecordProcesses_AgentID_Status VARCHAR(20);
    p_MJRecordProcesses_AgentID_WorkType VARCHAR(20);
    p_MJRecordProcesses_AgentID_ActionID UUID;
    p_MJRecordProcesses_AgentID_AgentID UUID;
    p_MJRecordProcesses_AgentID_PromptID UUID;
    p_MJRecordProcesses_AgentID_ScopeType VARCHAR(20);
    p_MJRecordProcesses_AgentID_ScopeViewID UUID;
    p_MJRecordProcesses_AgentID_ScopeListID UUID;
    p_MJRecordProcesses_AgentID_ScopeFilter TEXT;
    p_MJRecordProcesses_AgentID_OnChangeEnabled BOOLEAN;
    p_MJRecordProcesses_AgentID_OnChangeInvocationType VARCHAR(30);
    p_MJRecordProcesses_AgentID_OnChangeFilter TEXT;
    p_MJRecordProcesses_AgentID_ScheduleEnabled BOOLEAN;
    p_MJRecordProcesses_AgentID_CronExpression VARCHAR(120);
    p_MJRecordProcesses_AgentID_Timezone VARCHAR(100);
    p_MJRecordProcesses_AgentID_OnDemandEnabled BOOLEAN;
    p_MJRecordProcesses_AgentID_InputMapping TEXT;
    p_MJRecordProcesses_AgentID_OutputMapping TEXT;
    p_MJRecordProcesses_AgentID_SkipUnchanged BOOLEAN;
    p_MJRecordProcesses_AgentID_WatermarkStrategy VARCHAR(20);
    p_MJRecordProcesses_AgentID_BatchSize INTEGER;
    p_MJRecordProcesses_AgentID_MaxConcurrency INTEGER;
    p_MJRecordProcesses_AgentID_Configuration TEXT;
    p_MJSearchExecutionLogs_AIAgentIDID UUID;
    p_MJSearchExecutionLogs_AIAgentID_SearchScopeID UUID;
    p_MJSearchExecutionLogs_AIAgentID_UserID UUID;
    p_MJSearchExecutionLogs_AIAgentID_AIAgentID UUID;
    p_MJSearchExecutionLogs_AIAgentID_Query TEXT;
    p_MJSearchExecutionLogs_AIAgentID_TotalDurationMs INTEGER;
    p_MJSearchExecutionLogs_AIAgentID_ResultCount INTEGER;
    p_MJSearchExecutionLogs_AIAgentID_RerankerName VARCHAR(100);
    p_MJSearchExecutionLogs_AIAgentID_RerankerCostCents NUMERIC(10,4);
    p_MJSearchExecutionLogs_AIAgentID_Status VARCHAR(20);
    p_MJSearchExecutionLogs_AIAgentID_FailureReason VARCHAR(500);
    p_MJSearchExecutionLogs_AIAgentID_ProvidersJSON TEXT;
    p_MJTasks_AgentIDID UUID;
    p_MJTasks_AgentID_ParentID UUID;
    p_MJTasks_AgentID_Name VARCHAR(255);
    p_MJTasks_AgentID_Description TEXT;
    p_MJTasks_AgentID_TypeID UUID;
    p_MJTasks_AgentID_EnvironmentID UUID;
    p_MJTasks_AgentID_ProjectID UUID;
    p_MJTasks_AgentID_ConversationDetailID UUID;
    p_MJTasks_AgentID_UserID UUID;
    p_MJTasks_AgentID_AgentID UUID;
    p_MJTasks_AgentID_Status VARCHAR(50);
    p_MJTasks_AgentID_PercentComplete INTEGER;
    p_MJTasks_AgentID_DueAt TIMESTAMPTZ;
    p_MJTasks_AgentID_StartedAt TIMESTAMPTZ;
    p_MJTasks_AgentID_CompletedAt TIMESTAMPTZ;
BEGIN
-- Cascade update on Action using cursor to call spUpdateAction


    FOR _rec IN SELECT "ID", "CategoryID", "Name", "Description", "Type", "UserPrompt", "UserComments", "Code", "CodeComments", "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt", "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status", "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID", "Config", "RuntimeActionConfiguration", "MaxExecutionTimeMS", "CreatedByAgentID" FROM __mj."Action" WHERE "CreatedByAgentID" = p_ID
    LOOP
        p_MJActions_CreatedByAgentIDID := _rec."ID";
        p_MJActions_CreatedByAgentID_CategoryID := _rec."CategoryID";
        p_MJActions_CreatedByAgentID_Name := _rec."Name";
        p_MJActions_CreatedByAgentID_Description := _rec."Description";
        p_MJActions_CreatedByAgentID_Type := _rec."Type";
        p_MJActions_CreatedByAgentID_UserPrompt := _rec."UserPrompt";
        p_MJActions_CreatedByAgentID_UserComments := _rec."UserComments";
        p_MJActions_CreatedByAgentID_Code := _rec."Code";
        p_MJActions_CreatedByAgentID_CodeComments := _rec."CodeComments";
        p_MJActions_CreatedByAgentID_CodeApprovalStatus := _rec."CodeApprovalStatus";
        p_MJActions_CreatedByAgentID_CodeApprovalComments := _rec."CodeApprovalComments";
        p_MJActions_CreatedByAgentID_CodeApprovedByUserID := _rec."CodeApprovedByUserID";
        p_MJActions_CreatedByAgentID_CodeApprovedAt := _rec."CodeApprovedAt";
        p_MJActions_CreatedByAgentID_CodeLocked := _rec."CodeLocked";
        p_MJActions_CreatedByAgentID_ForceCodeGeneration := _rec."ForceCodeGeneration";
        p_MJActions_CreatedByAgentID_RetentionPeriod := _rec."RetentionPeriod";
        p_MJActions_CreatedByAgentID_Status := _rec."Status";
        p_MJActions_CreatedByAgentID_DriverClass := _rec."DriverClass";
        p_MJActions_CreatedByAgentID_ParentID := _rec."ParentID";
        p_MJActions_CreatedByAgentID_IconClass := _rec."IconClass";
        p_MJActions_CreatedByAgentID_DefaultCompactPromptID := _rec."DefaultCompactPromptID";
        p_MJActions_CreatedByAgentID_Config := _rec."Config";
        p_MJActions_CreatedByAgentID_RuntimeActionConfiguration := _rec."RuntimeActionConfiguration";
        p_MJActions_CreatedByAgentID_MaxExecutionTimeMS := _rec."MaxExecutionTimeMS";
        p_MJActions_CreatedByAgentID_CreatedByAgentID := _rec."CreatedByAgentID";
        -- Set the FK field to NULL
        p_MJActions_CreatedByAgentID_CreatedByAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAction"(p_ID => p_MJActions_CreatedByAgentIDID, p_CategoryID => p_MJActions_CreatedByAgentID_CategoryID, p_Name => p_MJActions_CreatedByAgentID_Name, p_Description => p_MJActions_CreatedByAgentID_Description, p_Type => p_MJActions_CreatedByAgentID_Type, p_UserPrompt => p_MJActions_CreatedByAgentID_UserPrompt, p_UserComments => p_MJActions_CreatedByAgentID_UserComments, p_Code => p_MJActions_CreatedByAgentID_Code, p_CodeComments => p_MJActions_CreatedByAgentID_CodeComments, p_CodeApprovalStatus => p_MJActions_CreatedByAgentID_CodeApprovalStatus, p_CodeApprovalComments => p_MJActions_CreatedByAgentID_CodeApprovalComments, p_CodeApprovedByUserID => p_MJActions_CreatedByAgentID_CodeApprovedByUserID, p_CodeApprovedAt => p_MJActions_CreatedByAgentID_CodeApprovedAt, p_CodeLocked => p_MJActions_CreatedByAgentID_CodeLocked, p_ForceCodeGeneration => p_MJActions_CreatedByAgentID_ForceCodeGeneration, p_RetentionPeriod => p_MJActions_CreatedByAgentID_RetentionPeriod, p_Status => p_MJActions_CreatedByAgentID_Status, p_DriverClass => p_MJActions_CreatedByAgentID_DriverClass, p_ParentID => p_MJActions_CreatedByAgentID_ParentID, p_IconClass => p_MJActions_CreatedByAgentID_IconClass, p_DefaultCompactPromptID => p_MJActions_CreatedByAgentID_DefaultCompactPromptID, p_Config => p_MJActions_CreatedByAgentID_Config, p_RuntimeActionConfiguration => p_MJActions_CreatedByAgentID_RuntimeActionConfiguration, p_MaxExecutionTimeMS => p_MJActions_CreatedByAgentID_MaxExecutionTimeMS, p_CreatedByAgentID_Clear => 1, p_CreatedByAgentID => p_MJActions_CreatedByAgentID_CreatedByAgentID);

    END LOOP;

    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction


    FOR _rec IN SELECT "ID", "AgentID", "ActionID", "Status", "MinExecutionsPerRun", "MaxExecutionsPerRun", "ResultExpirationTurns", "ResultExpirationMode", "CompactMode", "CompactLength", "CompactPromptID" FROM __mj."AIAgentAction" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentActions_AgentIDID := _rec."ID";
        p_MJAIAgentActions_AgentID_AgentID := _rec."AgentID";
        p_MJAIAgentActions_AgentID_ActionID := _rec."ActionID";
        p_MJAIAgentActions_AgentID_Status := _rec."Status";
        p_MJAIAgentActions_AgentID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgentActions_AgentID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgentActions_AgentID_ResultExpirationTurns := _rec."ResultExpirationTurns";
        p_MJAIAgentActions_AgentID_ResultExpirationMode := _rec."ResultExpirationMode";
        p_MJAIAgentActions_AgentID_CompactMode := _rec."CompactMode";
        p_MJAIAgentActions_AgentID_CompactLength := _rec."CompactLength";
        p_MJAIAgentActions_AgentID_CompactPromptID := _rec."CompactPromptID";
        -- Set the FK field to NULL
        p_MJAIAgentActions_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentAction"(p_ID => p_MJAIAgentActions_AgentIDID, p_AgentID_Clear => 1, p_AgentID => p_MJAIAgentActions_AgentID_AgentID, p_ActionID => p_MJAIAgentActions_AgentID_ActionID, p_Status => p_MJAIAgentActions_AgentID_Status, p_MinExecutionsPerRun => p_MJAIAgentActions_AgentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgentActions_AgentID_MaxExecutionsPerRun, p_ResultExpirationTurns => p_MJAIAgentActions_AgentID_ResultExpirationTurns, p_ResultExpirationMode => p_MJAIAgentActions_AgentID_ResultExpirationMode, p_CompactMode => p_MJAIAgentActions_AgentID_CompactMode, p_CompactLength => p_MJAIAgentActions_AgentID_CompactLength, p_CompactPromptID => p_MJAIAgentActions_AgentID_CompactPromptID);

    END LOOP;

    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentArtifactType" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentArtifactTypes_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentArtifactType"(p_ID => p_MJAIAgentArtifactTypes_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentClientTool using cursor to call spDeleteAIAgentClientTool

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentClientTool" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentClientTools_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentClientTool"(p_ID => p_MJAIAgentClientTools_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentCoAgent using cursor to call spDeleteAIAgentCoAgent

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentCoAgent" WHERE "CoAgentID" = p_ID
    LOOP
        p_MJAIAgentCoAgents_CoAgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentCoAgent"(p_ID => p_MJAIAgentCoAgents_CoAgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentCoAgent using cursor to call spUpdateAIAgentCoAgent


    FOR _rec IN SELECT "ID", "CoAgentID", "TargetAgentID", "TargetAgentTypeID", "Type", "IsDefault", "Sequence", "Status", "Configuration" FROM __mj."AIAgentCoAgent" WHERE "TargetAgentID" = p_ID
    LOOP
        p_MJAIAgentCoAgents_TargetAgentIDID := _rec."ID";
        p_MJAIAgentCoAgents_TargetAgentID_CoAgentID := _rec."CoAgentID";
        p_MJAIAgentCoAgents_TargetAgentID_TargetAgentID := _rec."TargetAgentID";
        p_MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID := _rec."TargetAgentTypeID";
        p_MJAIAgentCoAgents_TargetAgentID_Type := _rec."Type";
        p_MJAIAgentCoAgents_TargetAgentID_IsDefault := _rec."IsDefault";
        p_MJAIAgentCoAgents_TargetAgentID_Sequence := _rec."Sequence";
        p_MJAIAgentCoAgents_TargetAgentID_Status := _rec."Status";
        p_MJAIAgentCoAgents_TargetAgentID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJAIAgentCoAgents_TargetAgentID_TargetAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentCoAgent"(p_ID => p_MJAIAgentCoAgents_TargetAgentIDID, p_CoAgentID => p_MJAIAgentCoAgents_TargetAgentID_CoAgentID, p_TargetAgentID_Clear => 1, p_TargetAgentID => p_MJAIAgentCoAgents_TargetAgentID_TargetAgentID, p_TargetAgentTypeID => p_MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, p_Type => p_MJAIAgentCoAgents_TargetAgentID_Type, p_IsDefault => p_MJAIAgentCoAgents_TargetAgentID_IsDefault, p_Sequence => p_MJAIAgentCoAgents_TargetAgentID_Sequence, p_Status => p_MJAIAgentCoAgents_TargetAgentID_Status, p_Configuration => p_MJAIAgentCoAgents_TargetAgentID_Configuration);

    END LOOP;

    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentConfiguration" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentConfigurations_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentConfiguration"(p_ID => p_MJAIAgentConfigurations_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentDataSource" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentDataSources_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentDataSource"(p_ID => p_MJAIAgentDataSources_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentExample" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentExamples_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentExample"(p_ID => p_MJAIAgentExamples_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentLearningCycle" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentLearningCycles_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentLearningCycle"(p_ID => p_MJAIAgentLearningCycles_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentModality" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentModalities_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentModality"(p_ID => p_MJAIAgentModalities_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentModel using cursor to call spUpdateAIAgentModel


    FOR _rec IN SELECT "ID", "AgentID", "ModelID", "Active", "Priority" FROM __mj."AIAgentModel" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentModels_AgentIDID := _rec."ID";
        p_MJAIAgentModels_AgentID_AgentID := _rec."AgentID";
        p_MJAIAgentModels_AgentID_ModelID := _rec."ModelID";
        p_MJAIAgentModels_AgentID_Active := _rec."Active";
        p_MJAIAgentModels_AgentID_Priority := _rec."Priority";
        -- Set the FK field to NULL
        p_MJAIAgentModels_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentModel"(p_ID => p_MJAIAgentModels_AgentIDID, p_AgentID_Clear => 1, p_AgentID => p_MJAIAgentModels_AgentID_AgentID, p_ModelID => p_MJAIAgentModels_AgentID_ModelID, p_Active => p_MJAIAgentModels_AgentID_Active, p_Priority => p_MJAIAgentModels_AgentID_Priority);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore", "AuthorType" FROM __mj."AIAgentNote" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentNotes_AgentIDID := _rec."ID";
        p_MJAIAgentNotes_AgentID_AgentID := _rec."AgentID";
        p_MJAIAgentNotes_AgentID_AgentNoteTypeID := _rec."AgentNoteTypeID";
        p_MJAIAgentNotes_AgentID_Note := _rec."Note";
        p_MJAIAgentNotes_AgentID_UserID := _rec."UserID";
        p_MJAIAgentNotes_AgentID_Type := _rec."Type";
        p_MJAIAgentNotes_AgentID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentNotes_AgentID_Comments := _rec."Comments";
        p_MJAIAgentNotes_AgentID_Status := _rec."Status";
        p_MJAIAgentNotes_AgentID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentNotes_AgentID_SourceConversationDetailID := _rec."SourceConversationDetailID";
        p_MJAIAgentNotes_AgentID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentNotes_AgentID_CompanyID := _rec."CompanyID";
        p_MJAIAgentNotes_AgentID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentNotes_AgentID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentNotes_AgentID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentNotes_AgentID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentNotes_AgentID_AccessCount := _rec."AccessCount";
        p_MJAIAgentNotes_AgentID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID := _rec."ConsolidatedIntoNoteID";
        p_MJAIAgentNotes_AgentID_ConsolidationCount := _rec."ConsolidationCount";
        p_MJAIAgentNotes_AgentID_DerivedFromNoteIDs := _rec."DerivedFromNoteIDs";
        p_MJAIAgentNotes_AgentID_ProtectionTier := _rec."ProtectionTier";
        p_MJAIAgentNotes_AgentID_ImportanceScore := _rec."ImportanceScore";
        p_MJAIAgentNotes_AgentID_AuthorType := _rec."AuthorType";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_AgentIDID, p_AgentID_Clear => 1, p_AgentID => p_MJAIAgentNotes_AgentID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_AgentID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_AgentID_Note, p_UserID => p_MJAIAgentNotes_AgentID_UserID, p_Type => p_MJAIAgentNotes_AgentID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_AgentID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_AgentID_Comments, p_Status => p_MJAIAgentNotes_AgentID_Status, p_SourceConversationID => p_MJAIAgentNotes_AgentID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentNotes_AgentID_SourceConversationDetailID, p_SourceAIAgentRunID => p_MJAIAgentNotes_AgentID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_AgentID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_AgentID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_AgentID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentNotes_AgentID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_AgentID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_AgentID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_AgentID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, p_ConsolidationCount => p_MJAIAgentNotes_AgentID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_AgentID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_AgentID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_AgentID_ImportanceScore, p_AuthorType => p_MJAIAgentNotes_AgentID_AuthorType);

    END LOOP;

    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPermission" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentPermissions_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPermission"(p_ID => p_MJAIAgentPermissions_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPrompt" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentPrompts_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPrompt"(p_ID => p_MJAIAgentPrompts_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRelationship" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRelationships_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRelationship"(p_ID => p_MJAIAgentRelationships_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRelationship" WHERE "SubAgentID" = p_ID
    LOOP
        p_MJAIAgentRelationships_SubAgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRelationship"(p_ID => p_MJAIAgentRelationships_SubAgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRequest" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRequests_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRequest"(p_ID => p_MJAIAgentRequests_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRun" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRuns_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRun"(p_ID => p_MJAIAgentRuns_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentSearchScope using cursor to call spDeleteAIAgentSearchScope

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentSearchScope" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentSearchScopes_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentSearchScope"(p_ID => p_MJAIAgentSearchScopes_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentSession using cursor to call spDeleteAIAgentSession

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentSession" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentSessions_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentSession"(p_ID => p_MJAIAgentSessions_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentStep" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentSteps_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentStep"(p_ID => p_MJAIAgentSteps_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep


    FOR _rec IN SELECT "ID", "AgentID", "Name", "Description", "StepType", "StartingStep", "TimeoutSeconds", "RetryCount", "OnErrorBehavior", "ActionID", "SubAgentID", "PromptID", "ActionOutputMapping", "PositionX", "PositionY", "Width", "Height", "Status", "ActionInputMapping", "LoopBodyType", "Configuration" FROM __mj."AIAgentStep" WHERE "SubAgentID" = p_ID
    LOOP
        p_MJAIAgentSteps_SubAgentIDID := _rec."ID";
        p_MJAIAgentSteps_SubAgentID_AgentID := _rec."AgentID";
        p_MJAIAgentSteps_SubAgentID_Name := _rec."Name";
        p_MJAIAgentSteps_SubAgentID_Description := _rec."Description";
        p_MJAIAgentSteps_SubAgentID_StepType := _rec."StepType";
        p_MJAIAgentSteps_SubAgentID_StartingStep := _rec."StartingStep";
        p_MJAIAgentSteps_SubAgentID_TimeoutSeconds := _rec."TimeoutSeconds";
        p_MJAIAgentSteps_SubAgentID_RetryCount := _rec."RetryCount";
        p_MJAIAgentSteps_SubAgentID_OnErrorBehavior := _rec."OnErrorBehavior";
        p_MJAIAgentSteps_SubAgentID_ActionID := _rec."ActionID";
        p_MJAIAgentSteps_SubAgentID_SubAgentID := _rec."SubAgentID";
        p_MJAIAgentSteps_SubAgentID_PromptID := _rec."PromptID";
        p_MJAIAgentSteps_SubAgentID_ActionOutputMapping := _rec."ActionOutputMapping";
        p_MJAIAgentSteps_SubAgentID_PositionX := _rec."PositionX";
        p_MJAIAgentSteps_SubAgentID_PositionY := _rec."PositionY";
        p_MJAIAgentSteps_SubAgentID_Width := _rec."Width";
        p_MJAIAgentSteps_SubAgentID_Height := _rec."Height";
        p_MJAIAgentSteps_SubAgentID_Status := _rec."Status";
        p_MJAIAgentSteps_SubAgentID_ActionInputMapping := _rec."ActionInputMapping";
        p_MJAIAgentSteps_SubAgentID_LoopBodyType := _rec."LoopBodyType";
        p_MJAIAgentSteps_SubAgentID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJAIAgentSteps_SubAgentID_SubAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentStep"(p_ID => p_MJAIAgentSteps_SubAgentIDID, p_AgentID => p_MJAIAgentSteps_SubAgentID_AgentID, p_Name => p_MJAIAgentSteps_SubAgentID_Name, p_Description => p_MJAIAgentSteps_SubAgentID_Description, p_StepType => p_MJAIAgentSteps_SubAgentID_StepType, p_StartingStep => p_MJAIAgentSteps_SubAgentID_StartingStep, p_TimeoutSeconds => p_MJAIAgentSteps_SubAgentID_TimeoutSeconds, p_RetryCount => p_MJAIAgentSteps_SubAgentID_RetryCount, p_OnErrorBehavior => p_MJAIAgentSteps_SubAgentID_OnErrorBehavior, p_ActionID => p_MJAIAgentSteps_SubAgentID_ActionID, p_SubAgentID_Clear => 1, p_SubAgentID => p_MJAIAgentSteps_SubAgentID_SubAgentID, p_PromptID => p_MJAIAgentSteps_SubAgentID_PromptID, p_ActionOutputMapping => p_MJAIAgentSteps_SubAgentID_ActionOutputMapping, p_PositionX => p_MJAIAgentSteps_SubAgentID_PositionX, p_PositionY => p_MJAIAgentSteps_SubAgentID_PositionY, p_Width => p_MJAIAgentSteps_SubAgentID_Width, p_Height => p_MJAIAgentSteps_SubAgentID_Height, p_Status => p_MJAIAgentSteps_SubAgentID_Status, p_ActionInputMapping => p_MJAIAgentSteps_SubAgentID_ActionInputMapping, p_LoopBodyType => p_MJAIAgentSteps_SubAgentID_LoopBodyType, p_Configuration => p_MJAIAgentSteps_SubAgentID_Configuration);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess", "AcceptUnregisteredFiles", "DefaultCoAgentID", "TypeConfiguration", "AllowMemoryWrite", "RecordingDefault", "RecordingStorageProviderID", "DefaultMediaCollectionID" FROM __mj."AIAgent" WHERE "ParentID" = p_ID
    LOOP
        p_MJAIAgents_ParentIDID := _rec."ID";
        p_MJAIAgents_ParentID_Name := _rec."Name";
        p_MJAIAgents_ParentID_Description := _rec."Description";
        p_MJAIAgents_ParentID_LogoURL := _rec."LogoURL";
        p_MJAIAgents_ParentID_ParentID := _rec."ParentID";
        p_MJAIAgents_ParentID_ExposeAsAction := _rec."ExposeAsAction";
        p_MJAIAgents_ParentID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIAgents_ParentID_ExecutionMode := _rec."ExecutionMode";
        p_MJAIAgents_ParentID_EnableContextCompression := _rec."EnableContextCompression";
        p_MJAIAgents_ParentID_ContextCompressionMessageThreshold := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgents_ParentID_ContextCompressionPromptID := _rec."ContextCompressionPromptID";
        p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgents_ParentID_TypeID := _rec."TypeID";
        p_MJAIAgents_ParentID_Status := _rec."Status";
        p_MJAIAgents_ParentID_DriverClass := _rec."DriverClass";
        p_MJAIAgents_ParentID_IconClass := _rec."IconClass";
        p_MJAIAgents_ParentID_ModelSelectionMode := _rec."ModelSelectionMode";
        p_MJAIAgents_ParentID_PayloadDownstreamPaths := _rec."PayloadDownstreamPaths";
        p_MJAIAgents_ParentID_PayloadUpstreamPaths := _rec."PayloadUpstreamPaths";
        p_MJAIAgents_ParentID_PayloadSelfReadPaths := _rec."PayloadSelfReadPaths";
        p_MJAIAgents_ParentID_PayloadSelfWritePaths := _rec."PayloadSelfWritePaths";
        p_MJAIAgents_ParentID_PayloadScope := _rec."PayloadScope";
        p_MJAIAgents_ParentID_FinalPayloadValidation := _rec."FinalPayloadValidation";
        p_MJAIAgents_ParentID_FinalPayloadValidationMode := _rec."FinalPayloadValidationMode";
        p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries := _rec."FinalPayloadValidationMaxRetries";
        p_MJAIAgents_ParentID_MaxCostPerRun := _rec."MaxCostPerRun";
        p_MJAIAgents_ParentID_MaxTokensPerRun := _rec."MaxTokensPerRun";
        p_MJAIAgents_ParentID_MaxIterationsPerRun := _rec."MaxIterationsPerRun";
        p_MJAIAgents_ParentID_MaxTimePerRun := _rec."MaxTimePerRun";
        p_MJAIAgents_ParentID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgents_ParentID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgents_ParentID_StartingPayloadValidation := _rec."StartingPayloadValidation";
        p_MJAIAgents_ParentID_StartingPayloadValidationMode := _rec."StartingPayloadValidationMode";
        p_MJAIAgents_ParentID_DefaultPromptEffortLevel := _rec."DefaultPromptEffortLevel";
        p_MJAIAgents_ParentID_ChatHandlingOption := _rec."ChatHandlingOption";
        p_MJAIAgents_ParentID_DefaultArtifactTypeID := _rec."DefaultArtifactTypeID";
        p_MJAIAgents_ParentID_OwnerUserID := _rec."OwnerUserID";
        p_MJAIAgents_ParentID_InvocationMode := _rec."InvocationMode";
        p_MJAIAgents_ParentID_ArtifactCreationMode := _rec."ArtifactCreationMode";
        p_MJAIAgents_ParentID_FunctionalRequirements := _rec."FunctionalRequirements";
        p_MJAIAgents_ParentID_TechnicalDesign := _rec."TechnicalDesign";
        p_MJAIAgents_ParentID_InjectNotes := _rec."InjectNotes";
        p_MJAIAgents_ParentID_MaxNotesToInject := _rec."MaxNotesToInject";
        p_MJAIAgents_ParentID_NoteInjectionStrategy := _rec."NoteInjectionStrategy";
        p_MJAIAgents_ParentID_InjectExamples := _rec."InjectExamples";
        p_MJAIAgents_ParentID_MaxExamplesToInject := _rec."MaxExamplesToInject";
        p_MJAIAgents_ParentID_ExampleInjectionStrategy := _rec."ExampleInjectionStrategy";
        p_MJAIAgents_ParentID_IsRestricted := _rec."IsRestricted";
        p_MJAIAgents_ParentID_MessageMode := _rec."MessageMode";
        p_MJAIAgents_ParentID_MaxMessages := _rec."MaxMessages";
        p_MJAIAgents_ParentID_AttachmentStorageProviderID := _rec."AttachmentStorageProviderID";
        p_MJAIAgents_ParentID_AttachmentRootPath := _rec."AttachmentRootPath";
        p_MJAIAgents_ParentID_InlineStorageThresholdBytes := _rec."InlineStorageThresholdBytes";
        p_MJAIAgents_ParentID_AgentTypePromptParams := _rec."AgentTypePromptParams";
        p_MJAIAgents_ParentID_ScopeConfig := _rec."ScopeConfig";
        p_MJAIAgents_ParentID_NoteRetentionDays := _rec."NoteRetentionDays";
        p_MJAIAgents_ParentID_ExampleRetentionDays := _rec."ExampleRetentionDays";
        p_MJAIAgents_ParentID_AutoArchiveEnabled := _rec."AutoArchiveEnabled";
        p_MJAIAgents_ParentID_RerankerConfiguration := _rec."RerankerConfiguration";
        p_MJAIAgents_ParentID_CategoryID := _rec."CategoryID";
        p_MJAIAgents_ParentID_AllowEphemeralClientTools := _rec."AllowEphemeralClientTools";
        p_MJAIAgents_ParentID_DefaultStorageAccountID := _rec."DefaultStorageAccountID";
        p_MJAIAgents_ParentID_SearchScopeAccess := _rec."SearchScopeAccess";
        p_MJAIAgents_ParentID_AcceptUnregisteredFiles := _rec."AcceptUnregisteredFiles";
        p_MJAIAgents_ParentID_DefaultCoAgentID := _rec."DefaultCoAgentID";
        p_MJAIAgents_ParentID_TypeConfiguration := _rec."TypeConfiguration";
        p_MJAIAgents_ParentID_AllowMemoryWrite := _rec."AllowMemoryWrite";
        p_MJAIAgents_ParentID_RecordingDefault := _rec."RecordingDefault";
        p_MJAIAgents_ParentID_RecordingStorageProviderID := _rec."RecordingStorageProviderID";
        p_MJAIAgents_ParentID_DefaultMediaCollectionID := _rec."DefaultMediaCollectionID";
        -- Set the FK field to NULL
        p_MJAIAgents_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ParentIDID, p_Name => p_MJAIAgents_ParentID_Name, p_Description => p_MJAIAgents_ParentID_Description, p_LogoURL => p_MJAIAgents_ParentID_LogoURL, p_ParentID_Clear => 1, p_ParentID => p_MJAIAgents_ParentID_ParentID, p_ExposeAsAction => p_MJAIAgents_ParentID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ParentID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ParentID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ParentID_EnableContextCompression, p_ContextCompressionMessageThreshold => p_MJAIAgents_ParentID_ContextCompressionMessageThreshold, p_ContextCompressionPromptID => p_MJAIAgents_ParentID_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, p_TypeID => p_MJAIAgents_ParentID_TypeID, p_Status => p_MJAIAgents_ParentID_Status, p_DriverClass => p_MJAIAgents_ParentID_DriverClass, p_IconClass => p_MJAIAgents_ParentID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ParentID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ParentID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ParentID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ParentID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ParentID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ParentID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ParentID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ParentID_FinalPayloadValidationMode, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, p_MaxCostPerRun => p_MJAIAgents_ParentID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ParentID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ParentID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ParentID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ParentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ParentID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ParentID_StartingPayloadValidation, p_StartingPayloadValidationMode => p_MJAIAgents_ParentID_StartingPayloadValidationMode, p_DefaultPromptEffortLevel => p_MJAIAgents_ParentID_DefaultPromptEffortLevel, p_ChatHandlingOption => p_MJAIAgents_ParentID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ParentID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ParentID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ParentID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ParentID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ParentID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ParentID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ParentID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ParentID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ParentID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ParentID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ParentID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ParentID_ExampleInjectionStrategy, p_IsRestricted => p_MJAIAgents_ParentID_IsRestricted, p_MessageMode => p_MJAIAgents_ParentID_MessageMode, p_MaxMessages => p_MJAIAgents_ParentID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ParentID_AttachmentStorageProviderID, p_AttachmentRootPath => p_MJAIAgents_ParentID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ParentID_InlineStorageThresholdBytes, p_AgentTypePromptParams => p_MJAIAgents_ParentID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ParentID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ParentID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ParentID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ParentID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ParentID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ParentID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ParentID_AllowEphemeralClientTools, p_DefaultStorageAccountID => p_MJAIAgents_ParentID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_ParentID_SearchScopeAccess, p_AcceptUnregisteredFiles => p_MJAIAgents_ParentID_AcceptUnregisteredFiles, p_DefaultCoAgentID => p_MJAIAgents_ParentID_DefaultCoAgentID, p_TypeConfiguration => p_MJAIAgents_ParentID_TypeConfiguration, p_AllowMemoryWrite => p_MJAIAgents_ParentID_AllowMemoryWrite, p_RecordingDefault => p_MJAIAgents_ParentID_RecordingDefault, p_RecordingStorageProviderID => p_MJAIAgents_ParentID_RecordingStorageProviderID, p_DefaultMediaCollectionID => p_MJAIAgents_ParentID_DefaultMediaCollectionID);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess", "AcceptUnregisteredFiles", "DefaultCoAgentID", "TypeConfiguration", "AllowMemoryWrite", "RecordingDefault", "RecordingStorageProviderID", "DefaultMediaCollectionID" FROM __mj."AIAgent" WHERE "DefaultCoAgentID" = p_ID
    LOOP
        p_MJAIAgents_DefaultCoAgentIDID := _rec."ID";
        p_MJAIAgents_DefaultCoAgentID_Name := _rec."Name";
        p_MJAIAgents_DefaultCoAgentID_Description := _rec."Description";
        p_MJAIAgents_DefaultCoAgentID_LogoURL := _rec."LogoURL";
        p_MJAIAgents_DefaultCoAgentID_ParentID := _rec."ParentID";
        p_MJAIAgents_DefaultCoAgentID_ExposeAsAction := _rec."ExposeAsAction";
        p_MJAIAgents_DefaultCoAgentID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIAgents_DefaultCoAgentID_ExecutionMode := _rec."ExecutionMode";
        p_MJAIAgents_DefaultCoAgentID_EnableContextCompression := _rec."EnableContextCompression";
        p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageTh_2ba4d7 := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID := _rec."ContextCompressionPromptID";
        p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRe_601f1d := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgents_DefaultCoAgentID_TypeID := _rec."TypeID";
        p_MJAIAgents_DefaultCoAgentID_Status := _rec."Status";
        p_MJAIAgents_DefaultCoAgentID_DriverClass := _rec."DriverClass";
        p_MJAIAgents_DefaultCoAgentID_IconClass := _rec."IconClass";
        p_MJAIAgents_DefaultCoAgentID_ModelSelectionMode := _rec."ModelSelectionMode";
        p_MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths := _rec."PayloadDownstreamPaths";
        p_MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths := _rec."PayloadUpstreamPaths";
        p_MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths := _rec."PayloadSelfReadPaths";
        p_MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths := _rec."PayloadSelfWritePaths";
        p_MJAIAgents_DefaultCoAgentID_PayloadScope := _rec."PayloadScope";
        p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidation := _rec."FinalPayloadValidation";
        p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode := _rec."FinalPayloadValidationMode";
        p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries := _rec."FinalPayloadValidationMaxRetries";
        p_MJAIAgents_DefaultCoAgentID_MaxCostPerRun := _rec."MaxCostPerRun";
        p_MJAIAgents_DefaultCoAgentID_MaxTokensPerRun := _rec."MaxTokensPerRun";
        p_MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun := _rec."MaxIterationsPerRun";
        p_MJAIAgents_DefaultCoAgentID_MaxTimePerRun := _rec."MaxTimePerRun";
        p_MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidation := _rec."StartingPayloadValidation";
        p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode := _rec."StartingPayloadValidationMode";
        p_MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel := _rec."DefaultPromptEffortLevel";
        p_MJAIAgents_DefaultCoAgentID_ChatHandlingOption := _rec."ChatHandlingOption";
        p_MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID := _rec."DefaultArtifactTypeID";
        p_MJAIAgents_DefaultCoAgentID_OwnerUserID := _rec."OwnerUserID";
        p_MJAIAgents_DefaultCoAgentID_InvocationMode := _rec."InvocationMode";
        p_MJAIAgents_DefaultCoAgentID_ArtifactCreationMode := _rec."ArtifactCreationMode";
        p_MJAIAgents_DefaultCoAgentID_FunctionalRequirements := _rec."FunctionalRequirements";
        p_MJAIAgents_DefaultCoAgentID_TechnicalDesign := _rec."TechnicalDesign";
        p_MJAIAgents_DefaultCoAgentID_InjectNotes := _rec."InjectNotes";
        p_MJAIAgents_DefaultCoAgentID_MaxNotesToInject := _rec."MaxNotesToInject";
        p_MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy := _rec."NoteInjectionStrategy";
        p_MJAIAgents_DefaultCoAgentID_InjectExamples := _rec."InjectExamples";
        p_MJAIAgents_DefaultCoAgentID_MaxExamplesToInject := _rec."MaxExamplesToInject";
        p_MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy := _rec."ExampleInjectionStrategy";
        p_MJAIAgents_DefaultCoAgentID_IsRestricted := _rec."IsRestricted";
        p_MJAIAgents_DefaultCoAgentID_MessageMode := _rec."MessageMode";
        p_MJAIAgents_DefaultCoAgentID_MaxMessages := _rec."MaxMessages";
        p_MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID := _rec."AttachmentStorageProviderID";
        p_MJAIAgents_DefaultCoAgentID_AttachmentRootPath := _rec."AttachmentRootPath";
        p_MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes := _rec."InlineStorageThresholdBytes";
        p_MJAIAgents_DefaultCoAgentID_AgentTypePromptParams := _rec."AgentTypePromptParams";
        p_MJAIAgents_DefaultCoAgentID_ScopeConfig := _rec."ScopeConfig";
        p_MJAIAgents_DefaultCoAgentID_NoteRetentionDays := _rec."NoteRetentionDays";
        p_MJAIAgents_DefaultCoAgentID_ExampleRetentionDays := _rec."ExampleRetentionDays";
        p_MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled := _rec."AutoArchiveEnabled";
        p_MJAIAgents_DefaultCoAgentID_RerankerConfiguration := _rec."RerankerConfiguration";
        p_MJAIAgents_DefaultCoAgentID_CategoryID := _rec."CategoryID";
        p_MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools := _rec."AllowEphemeralClientTools";
        p_MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID := _rec."DefaultStorageAccountID";
        p_MJAIAgents_DefaultCoAgentID_SearchScopeAccess := _rec."SearchScopeAccess";
        p_MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles := _rec."AcceptUnregisteredFiles";
        p_MJAIAgents_DefaultCoAgentID_DefaultCoAgentID := _rec."DefaultCoAgentID";
        p_MJAIAgents_DefaultCoAgentID_TypeConfiguration := _rec."TypeConfiguration";
        p_MJAIAgents_DefaultCoAgentID_AllowMemoryWrite := _rec."AllowMemoryWrite";
        p_MJAIAgents_DefaultCoAgentID_RecordingDefault := _rec."RecordingDefault";
        p_MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID := _rec."RecordingStorageProviderID";
        p_MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID := _rec."DefaultMediaCollectionID";
        -- Set the FK field to NULL
        p_MJAIAgents_DefaultCoAgentID_DefaultCoAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_DefaultCoAgentIDID, p_Name => p_MJAIAgents_DefaultCoAgentID_Name, p_Description => p_MJAIAgents_DefaultCoAgentID_Description, p_LogoURL => p_MJAIAgents_DefaultCoAgentID_LogoURL, p_ParentID => p_MJAIAgents_DefaultCoAgentID_ParentID, p_ExposeAsAction => p_MJAIAgents_DefaultCoAgentID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_DefaultCoAgentID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_DefaultCoAgentID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_DefaultCoAgentID_EnableContextCompression, p_ContextCompressionMessageThreshold => p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageTh_2ba4d7, p_ContextCompressionPromptID => p_MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRe_601f1d, p_TypeID => p_MJAIAgents_DefaultCoAgentID_TypeID, p_Status => p_MJAIAgents_DefaultCoAgentID_Status, p_DriverClass => p_MJAIAgents_DefaultCoAgentID_DriverClass, p_IconClass => p_MJAIAgents_DefaultCoAgentID_IconClass, p_ModelSelectionMode => p_MJAIAgents_DefaultCoAgentID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_DefaultCoAgentID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, p_MaxCostPerRun => p_MJAIAgents_DefaultCoAgentID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_DefaultCoAgentID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, p_StartingPayloadValidationMode => p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, p_DefaultPromptEffortLevel => p_MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, p_ChatHandlingOption => p_MJAIAgents_DefaultCoAgentID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_DefaultCoAgentID_OwnerUserID, p_InvocationMode => p_MJAIAgents_DefaultCoAgentID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_DefaultCoAgentID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_DefaultCoAgentID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_DefaultCoAgentID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_DefaultCoAgentID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_DefaultCoAgentID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, p_IsRestricted => p_MJAIAgents_DefaultCoAgentID_IsRestricted, p_MessageMode => p_MJAIAgents_DefaultCoAgentID_MessageMode, p_MaxMessages => p_MJAIAgents_DefaultCoAgentID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, p_AttachmentRootPath => p_MJAIAgents_DefaultCoAgentID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, p_AgentTypePromptParams => p_MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_DefaultCoAgentID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_DefaultCoAgentID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_DefaultCoAgentID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_DefaultCoAgentID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, p_DefaultStorageAccountID => p_MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_DefaultCoAgentID_SearchScopeAccess, p_AcceptUnregisteredFiles => p_MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, p_DefaultCoAgentID_Clear => 1, p_DefaultCoAgentID => p_MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, p_TypeConfiguration => p_MJAIAgents_DefaultCoAgentID_TypeConfiguration, p_AllowMemoryWrite => p_MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, p_RecordingDefault => p_MJAIAgents_DefaultCoAgentID_RecordingDefault, p_RecordingStorageProviderID => p_MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, p_DefaultMediaCollectionID => p_MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID);

    END LOOP;

    
    -- Cascade delete from AIBridgeAgentIdentity using cursor to call spDeleteAIBridgeAgentIdentity

    FOR _rec IN SELECT "ID" FROM __mj."AIBridgeAgentIdentity" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIBridgeAgentIdentities_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIBridgeAgentIdentity"(p_ID => p_MJAIBridgeAgentIdentities_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIPromptRuns_AgentIDID := _rec."ID";
        p_MJAIPromptRuns_AgentID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_AgentID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_AgentID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_AgentID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_AgentID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_AgentID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_AgentID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_AgentID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_AgentID_Messages := _rec."Messages";
        p_MJAIPromptRuns_AgentID_Result := _rec."Result";
        p_MJAIPromptRuns_AgentID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_AgentID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_AgentID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_AgentID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_AgentID_Success := _rec."Success";
        p_MJAIPromptRuns_AgentID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_AgentID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_AgentID_RunType := _rec."RunType";
        p_MJAIPromptRuns_AgentID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_AgentID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_AgentID_Cost := _rec."Cost";
        p_MJAIPromptRuns_AgentID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_AgentID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_AgentID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_AgentID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_AgentID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_AgentID_TopP := _rec."TopP";
        p_MJAIPromptRuns_AgentID_TopK := _rec."TopK";
        p_MJAIPromptRuns_AgentID_MinP := _rec."MinP";
        p_MJAIPromptRuns_AgentID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_AgentID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_AgentID_Seed := _rec."Seed";
        p_MJAIPromptRuns_AgentID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_AgentID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_AgentID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_AgentID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_AgentID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_AgentID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_AgentID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_AgentID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_AgentID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_AgentID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_AgentID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_AgentID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_AgentID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_AgentID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_AgentID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_AgentID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_AgentID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_AgentID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_AgentID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_AgentID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_AgentID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_AgentID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_AgentID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_AgentID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_AgentID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_AgentID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_AgentID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_AgentID_Status := _rec."Status";
        p_MJAIPromptRuns_AgentID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_AgentID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_AgentID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_AgentID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_AgentID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_AgentID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_AgentID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_AgentID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_AgentID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_AgentID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_AgentID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_AgentID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_AgentID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_AgentID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_AgentID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_AgentID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_AgentID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_AgentID_RunName := _rec."RunName";
        p_MJAIPromptRuns_AgentID_Comments := _rec."Comments";
        p_MJAIPromptRuns_AgentID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_AgentID_AssistantPrefill := _rec."AssistantPrefill";
        p_MJAIPromptRuns_AgentID_TokensCacheRead := _rec."TokensCacheRead";
        p_MJAIPromptRuns_AgentID_TokensCacheWrite := _rec."TokensCacheWrite";
        p_MJAIPromptRuns_AgentID_TokensCacheReadRollup := _rec."TokensCacheReadRollup";
        p_MJAIPromptRuns_AgentID_TokensCacheWriteRollup := _rec."TokensCacheWriteRollup";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_AgentIDID, p_PromptID => p_MJAIPromptRuns_AgentID_PromptID, p_ModelID => p_MJAIPromptRuns_AgentID_ModelID, p_VendorID => p_MJAIPromptRuns_AgentID_VendorID, p_AgentID_Clear => 1, p_AgentID => p_MJAIPromptRuns_AgentID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_AgentID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_AgentID_RunAt, p_CompletedAt => p_MJAIPromptRuns_AgentID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_AgentID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_AgentID_Messages, p_Result => p_MJAIPromptRuns_AgentID_Result, p_TokensUsed => p_MJAIPromptRuns_AgentID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_AgentID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_AgentID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_AgentID_TotalCost, p_Success => p_MJAIPromptRuns_AgentID_Success, p_ErrorMessage => p_MJAIPromptRuns_AgentID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_AgentID_ParentID, p_RunType => p_MJAIPromptRuns_AgentID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_AgentID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_AgentID_AgentRunID, p_Cost => p_MJAIPromptRuns_AgentID_Cost, p_CostCurrency => p_MJAIPromptRuns_AgentID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_AgentID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_AgentID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_AgentID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_AgentID_Temperature, p_TopP => p_MJAIPromptRuns_AgentID_TopP, p_TopK => p_MJAIPromptRuns_AgentID_TopK, p_MinP => p_MJAIPromptRuns_AgentID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_AgentID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_AgentID_PresencePenalty, p_Seed => p_MJAIPromptRuns_AgentID_Seed, p_StopSequences => p_MJAIPromptRuns_AgentID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_AgentID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_AgentID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_AgentID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_AgentID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_AgentID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_AgentID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_AgentID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_AgentID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_AgentID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_AgentID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_AgentID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_AgentID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_AgentID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_AgentID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_AgentID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_AgentID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_AgentID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_AgentID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_AgentID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_AgentID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_AgentID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_AgentID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_AgentID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_AgentID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_AgentID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_AgentID_ModelSelection, p_Status => p_MJAIPromptRuns_AgentID_Status, p_Cancelled => p_MJAIPromptRuns_AgentID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_AgentID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_AgentID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_AgentID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_AgentID_CacheHit, p_CacheKey => p_MJAIPromptRuns_AgentID_CacheKey, p_JudgeID => p_MJAIPromptRuns_AgentID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_AgentID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_AgentID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_AgentID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_AgentID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_AgentID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_AgentID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_AgentID_QueueTime, p_PromptTime => p_MJAIPromptRuns_AgentID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_AgentID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_AgentID_EffortLevel, p_RunName => p_MJAIPromptRuns_AgentID_RunName, p_Comments => p_MJAIPromptRuns_AgentID_Comments, p_TestRunID => p_MJAIPromptRuns_AgentID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_AgentID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_AgentID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_AgentID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_AgentID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_AgentID_TokensCacheWriteRollup);

    END LOOP;

    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache


    FOR _rec IN SELECT "ID", "AIPromptID", "AIModelID", "RunAt", "PromptText", "ResultText", "Status", "ExpiredOn", "VendorID", "AgentID", "ConfigurationID", "PromptEmbedding", "PromptRunID" FROM __mj."AIResultCache" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIResultCache_AgentIDID := _rec."ID";
        p_MJAIResultCache_AgentID_AIPromptID := _rec."AIPromptID";
        p_MJAIResultCache_AgentID_AIModelID := _rec."AIModelID";
        p_MJAIResultCache_AgentID_RunAt := _rec."RunAt";
        p_MJAIResultCache_AgentID_PromptText := _rec."PromptText";
        p_MJAIResultCache_AgentID_ResultText := _rec."ResultText";
        p_MJAIResultCache_AgentID_Status := _rec."Status";
        p_MJAIResultCache_AgentID_ExpiredOn := _rec."ExpiredOn";
        p_MJAIResultCache_AgentID_VendorID := _rec."VendorID";
        p_MJAIResultCache_AgentID_AgentID := _rec."AgentID";
        p_MJAIResultCache_AgentID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIResultCache_AgentID_PromptEmbedding := _rec."PromptEmbedding";
        p_MJAIResultCache_AgentID_PromptRunID := _rec."PromptRunID";
        -- Set the FK field to NULL
        p_MJAIResultCache_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIResultCache"(p_ID => p_MJAIResultCache_AgentIDID, p_AIPromptID => p_MJAIResultCache_AgentID_AIPromptID, p_AIModelID => p_MJAIResultCache_AgentID_AIModelID, p_RunAt => p_MJAIResultCache_AgentID_RunAt, p_PromptText => p_MJAIResultCache_AgentID_PromptText, p_ResultText => p_MJAIResultCache_AgentID_ResultText, p_Status => p_MJAIResultCache_AgentID_Status, p_ExpiredOn => p_MJAIResultCache_AgentID_ExpiredOn, p_VendorID => p_MJAIResultCache_AgentID_VendorID, p_AgentID_Clear => 1, p_AgentID => p_MJAIResultCache_AgentID_AgentID, p_ConfigurationID => p_MJAIResultCache_AgentID_ConfigurationID, p_PromptEmbedding => p_MJAIResultCache_AgentID_PromptEmbedding, p_PromptRunID => p_MJAIResultCache_AgentID_PromptRunID);

    END LOOP;

    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID", "TurnEndedAt", "UtteranceStartMs", "UtteranceEndMs", "MediaType" FROM __mj."ConversationDetail" WHERE "AgentID" = p_ID
    LOOP
        p_MJConversationDetails_AgentIDID := _rec."ID";
        p_MJConversationDetails_AgentID_ConversationID := _rec."ConversationID";
        p_MJConversationDetails_AgentID_ExternalID := _rec."ExternalID";
        p_MJConversationDetails_AgentID_Role := _rec."Role";
        p_MJConversationDetails_AgentID_Message := _rec."Message";
        p_MJConversationDetails_AgentID_Error := _rec."Error";
        p_MJConversationDetails_AgentID_HiddenToUser := _rec."HiddenToUser";
        p_MJConversationDetails_AgentID_UserRating := _rec."UserRating";
        p_MJConversationDetails_AgentID_UserFeedback := _rec."UserFeedback";
        p_MJConversationDetails_AgentID_ReflectionInsights := _rec."ReflectionInsights";
        p_MJConversationDetails_AgentID_SummaryOfEarlierConversation := _rec."SummaryOfEarlierConversation";
        p_MJConversationDetails_AgentID_UserID := _rec."UserID";
        p_MJConversationDetails_AgentID_ArtifactID := _rec."ArtifactID";
        p_MJConversationDetails_AgentID_ArtifactVersionID := _rec."ArtifactVersionID";
        p_MJConversationDetails_AgentID_CompletionTime := _rec."CompletionTime";
        p_MJConversationDetails_AgentID_IsPinned := _rec."IsPinned";
        p_MJConversationDetails_AgentID_ParentID := _rec."ParentID";
        p_MJConversationDetails_AgentID_AgentID := _rec."AgentID";
        p_MJConversationDetails_AgentID_Status := _rec."Status";
        p_MJConversationDetails_AgentID_SuggestedResponses := _rec."SuggestedResponses";
        p_MJConversationDetails_AgentID_TestRunID := _rec."TestRunID";
        p_MJConversationDetails_AgentID_ResponseForm := _rec."ResponseForm";
        p_MJConversationDetails_AgentID_ActionableCommands := _rec."ActionableCommands";
        p_MJConversationDetails_AgentID_AutomaticCommands := _rec."AutomaticCommands";
        p_MJConversationDetails_AgentID_OriginalMessageChanged := _rec."OriginalMessageChanged";
        p_MJConversationDetails_AgentID_AgentSessionID := _rec."AgentSessionID";
        p_MJConversationDetails_AgentID_TurnEndedAt := _rec."TurnEndedAt";
        p_MJConversationDetails_AgentID_UtteranceStartMs := _rec."UtteranceStartMs";
        p_MJConversationDetails_AgentID_UtteranceEndMs := _rec."UtteranceEndMs";
        p_MJConversationDetails_AgentID_MediaType := _rec."MediaType";
        -- Set the FK field to NULL
        p_MJConversationDetails_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_AgentIDID, p_ConversationID => p_MJConversationDetails_AgentID_ConversationID, p_ExternalID => p_MJConversationDetails_AgentID_ExternalID, p_Role => p_MJConversationDetails_AgentID_Role, p_Message => p_MJConversationDetails_AgentID_Message, p_Error => p_MJConversationDetails_AgentID_Error, p_HiddenToUser => p_MJConversationDetails_AgentID_HiddenToUser, p_UserRating => p_MJConversationDetails_AgentID_UserRating, p_UserFeedback => p_MJConversationDetails_AgentID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_AgentID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_AgentID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_AgentID_UserID, p_ArtifactID => p_MJConversationDetails_AgentID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_AgentID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_AgentID_CompletionTime, p_IsPinned => p_MJConversationDetails_AgentID_IsPinned, p_ParentID => p_MJConversationDetails_AgentID_ParentID, p_AgentID_Clear => 1, p_AgentID => p_MJConversationDetails_AgentID_AgentID, p_Status => p_MJConversationDetails_AgentID_Status, p_SuggestedResponses => p_MJConversationDetails_AgentID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_AgentID_TestRunID, p_ResponseForm => p_MJConversationDetails_AgentID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_AgentID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_AgentID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_AgentID_OriginalMessageChanged, p_AgentSessionID => p_MJConversationDetails_AgentID_AgentSessionID, p_TurnEndedAt => p_MJConversationDetails_AgentID_TurnEndedAt, p_UtteranceStartMs => p_MJConversationDetails_AgentID_UtteranceStartMs, p_UtteranceEndMs => p_MJConversationDetails_AgentID_UtteranceEndMs, p_MediaType => p_MJConversationDetails_AgentID_MediaType);

    END LOOP;

    
    -- Cascade delete from ConversationWidgetInstance using cursor to call spDeleteConversationWidgetInstance

    FOR _rec IN SELECT "ID" FROM __mj."ConversationWidgetInstance" WHERE "PinnedAgentID" = p_ID
    LOOP
        p_MJConversationWidgetInstances_PinnedAgentIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationWidgetInstance"(p_ID => p_MJConversationWidgetInstances_PinnedAgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation


    FOR _rec IN SELECT "ID", "UserID", "ExternalID", "Name", "Description", "Type", "IsArchived", "LinkedEntityID", "LinkedRecordID", "DataContextID", "Status", "EnvironmentID", "ProjectID", "IsPinned", "TestRunID", "ApplicationScope", "ApplicationID", "DefaultAgentID", "AdditionalData", "RecordingFileID", "EgressID", "VisitorKey", "LastConversationID" FROM __mj."Conversation" WHERE "DefaultAgentID" = p_ID
    LOOP
        p_MJConversations_DefaultAgentIDID := _rec."ID";
        p_MJConversations_DefaultAgentID_UserID := _rec."UserID";
        p_MJConversations_DefaultAgentID_ExternalID := _rec."ExternalID";
        p_MJConversations_DefaultAgentID_Name := _rec."Name";
        p_MJConversations_DefaultAgentID_Description := _rec."Description";
        p_MJConversations_DefaultAgentID_Type := _rec."Type";
        p_MJConversations_DefaultAgentID_IsArchived := _rec."IsArchived";
        p_MJConversations_DefaultAgentID_LinkedEntityID := _rec."LinkedEntityID";
        p_MJConversations_DefaultAgentID_LinkedRecordID := _rec."LinkedRecordID";
        p_MJConversations_DefaultAgentID_DataContextID := _rec."DataContextID";
        p_MJConversations_DefaultAgentID_Status := _rec."Status";
        p_MJConversations_DefaultAgentID_EnvironmentID := _rec."EnvironmentID";
        p_MJConversations_DefaultAgentID_ProjectID := _rec."ProjectID";
        p_MJConversations_DefaultAgentID_IsPinned := _rec."IsPinned";
        p_MJConversations_DefaultAgentID_TestRunID := _rec."TestRunID";
        p_MJConversations_DefaultAgentID_ApplicationScope := _rec."ApplicationScope";
        p_MJConversations_DefaultAgentID_ApplicationID := _rec."ApplicationID";
        p_MJConversations_DefaultAgentID_DefaultAgentID := _rec."DefaultAgentID";
        p_MJConversations_DefaultAgentID_AdditionalData := _rec."AdditionalData";
        p_MJConversations_DefaultAgentID_RecordingFileID := _rec."RecordingFileID";
        p_MJConversations_DefaultAgentID_EgressID := _rec."EgressID";
        p_MJConversations_DefaultAgentID_VisitorKey := _rec."VisitorKey";
        p_MJConversations_DefaultAgentID_LastConversationID := _rec."LastConversationID";
        -- Set the FK field to NULL
        p_MJConversations_DefaultAgentID_DefaultAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversation"(p_ID => p_MJConversations_DefaultAgentIDID, p_UserID => p_MJConversations_DefaultAgentID_UserID, p_ExternalID => p_MJConversations_DefaultAgentID_ExternalID, p_Name => p_MJConversations_DefaultAgentID_Name, p_Description => p_MJConversations_DefaultAgentID_Description, p_Type => p_MJConversations_DefaultAgentID_Type, p_IsArchived => p_MJConversations_DefaultAgentID_IsArchived, p_LinkedEntityID => p_MJConversations_DefaultAgentID_LinkedEntityID, p_LinkedRecordID => p_MJConversations_DefaultAgentID_LinkedRecordID, p_DataContextID => p_MJConversations_DefaultAgentID_DataContextID, p_Status => p_MJConversations_DefaultAgentID_Status, p_EnvironmentID => p_MJConversations_DefaultAgentID_EnvironmentID, p_ProjectID => p_MJConversations_DefaultAgentID_ProjectID, p_IsPinned => p_MJConversations_DefaultAgentID_IsPinned, p_TestRunID => p_MJConversations_DefaultAgentID_TestRunID, p_ApplicationScope => p_MJConversations_DefaultAgentID_ApplicationScope, p_ApplicationID => p_MJConversations_DefaultAgentID_ApplicationID, p_DefaultAgentID_Clear => 1, p_DefaultAgentID => p_MJConversations_DefaultAgentID_DefaultAgentID, p_AdditionalData => p_MJConversations_DefaultAgentID_AdditionalData, p_RecordingFileID => p_MJConversations_DefaultAgentID_RecordingFileID, p_EgressID => p_MJConversations_DefaultAgentID_EgressID, p_VisitorKey => p_MJConversations_DefaultAgentID_VisitorKey, p_LastConversationID => p_MJConversations_DefaultAgentID_LastConversationID);

    END LOOP;

    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument


    FOR _rec IN SELECT "ID", "Name", "TypeID", "EntityID", "VectorDatabaseID", "Status", "TemplateID", "AIModelID", "PotentialMatchThreshold", "AbsoluteMatchThreshold", "VectorIndexID", "Configuration", "EnableLLMReasoning", "ReasoningMode", "ReasoningThreshold", "ReasoningPromptID", "ReasoningAgentID", "AutomationLevel" FROM __mj."EntityDocument" WHERE "ReasoningAgentID" = p_ID
    LOOP
        p_MJEntityDocuments_ReasoningAgentIDID := _rec."ID";
        p_MJEntityDocuments_ReasoningAgentID_Name := _rec."Name";
        p_MJEntityDocuments_ReasoningAgentID_TypeID := _rec."TypeID";
        p_MJEntityDocuments_ReasoningAgentID_EntityID := _rec."EntityID";
        p_MJEntityDocuments_ReasoningAgentID_VectorDatabaseID := _rec."VectorDatabaseID";
        p_MJEntityDocuments_ReasoningAgentID_Status := _rec."Status";
        p_MJEntityDocuments_ReasoningAgentID_TemplateID := _rec."TemplateID";
        p_MJEntityDocuments_ReasoningAgentID_AIModelID := _rec."AIModelID";
        p_MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold := _rec."PotentialMatchThreshold";
        p_MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold := _rec."AbsoluteMatchThreshold";
        p_MJEntityDocuments_ReasoningAgentID_VectorIndexID := _rec."VectorIndexID";
        p_MJEntityDocuments_ReasoningAgentID_Configuration := _rec."Configuration";
        p_MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning := _rec."EnableLLMReasoning";
        p_MJEntityDocuments_ReasoningAgentID_ReasoningMode := _rec."ReasoningMode";
        p_MJEntityDocuments_ReasoningAgentID_ReasoningThreshold := _rec."ReasoningThreshold";
        p_MJEntityDocuments_ReasoningAgentID_ReasoningPromptID := _rec."ReasoningPromptID";
        p_MJEntityDocuments_ReasoningAgentID_ReasoningAgentID := _rec."ReasoningAgentID";
        p_MJEntityDocuments_ReasoningAgentID_AutomationLevel := _rec."AutomationLevel";
        -- Set the FK field to NULL
        p_MJEntityDocuments_ReasoningAgentID_ReasoningAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateEntityDocument"(p_ID => p_MJEntityDocuments_ReasoningAgentIDID, p_Name => p_MJEntityDocuments_ReasoningAgentID_Name, p_TypeID => p_MJEntityDocuments_ReasoningAgentID_TypeID, p_EntityID => p_MJEntityDocuments_ReasoningAgentID_EntityID, p_VectorDatabaseID => p_MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, p_Status => p_MJEntityDocuments_ReasoningAgentID_Status, p_TemplateID => p_MJEntityDocuments_ReasoningAgentID_TemplateID, p_AIModelID => p_MJEntityDocuments_ReasoningAgentID_AIModelID, p_PotentialMatchThreshold => p_MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, p_AbsoluteMatchThreshold => p_MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, p_VectorIndexID => p_MJEntityDocuments_ReasoningAgentID_VectorIndexID, p_Configuration => p_MJEntityDocuments_ReasoningAgentID_Configuration, p_EnableLLMReasoning => p_MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, p_ReasoningMode => p_MJEntityDocuments_ReasoningAgentID_ReasoningMode, p_ReasoningThreshold => p_MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, p_ReasoningPromptID => p_MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, p_ReasoningAgentID_Clear => 1, p_ReasoningAgentID => p_MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, p_AutomationLevel => p_MJEntityDocuments_ReasoningAgentID_AutomationLevel);

    END LOOP;

    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess


    FOR _rec IN SELECT "ID", "Name", "Description", "CategoryID", "EntityID", "Status", "WorkType", "ActionID", "AgentID", "PromptID", "ScopeType", "ScopeViewID", "ScopeListID", "ScopeFilter", "OnChangeEnabled", "OnChangeInvocationType", "OnChangeFilter", "ScheduleEnabled", "CronExpression", "Timezone", "OnDemandEnabled", "InputMapping", "OutputMapping", "SkipUnchanged", "WatermarkStrategy", "BatchSize", "MaxConcurrency", "Configuration" FROM __mj."RecordProcess" WHERE "AgentID" = p_ID
    LOOP
        p_MJRecordProcesses_AgentIDID := _rec."ID";
        p_MJRecordProcesses_AgentID_Name := _rec."Name";
        p_MJRecordProcesses_AgentID_Description := _rec."Description";
        p_MJRecordProcesses_AgentID_CategoryID := _rec."CategoryID";
        p_MJRecordProcesses_AgentID_EntityID := _rec."EntityID";
        p_MJRecordProcesses_AgentID_Status := _rec."Status";
        p_MJRecordProcesses_AgentID_WorkType := _rec."WorkType";
        p_MJRecordProcesses_AgentID_ActionID := _rec."ActionID";
        p_MJRecordProcesses_AgentID_AgentID := _rec."AgentID";
        p_MJRecordProcesses_AgentID_PromptID := _rec."PromptID";
        p_MJRecordProcesses_AgentID_ScopeType := _rec."ScopeType";
        p_MJRecordProcesses_AgentID_ScopeViewID := _rec."ScopeViewID";
        p_MJRecordProcesses_AgentID_ScopeListID := _rec."ScopeListID";
        p_MJRecordProcesses_AgentID_ScopeFilter := _rec."ScopeFilter";
        p_MJRecordProcesses_AgentID_OnChangeEnabled := _rec."OnChangeEnabled";
        p_MJRecordProcesses_AgentID_OnChangeInvocationType := _rec."OnChangeInvocationType";
        p_MJRecordProcesses_AgentID_OnChangeFilter := _rec."OnChangeFilter";
        p_MJRecordProcesses_AgentID_ScheduleEnabled := _rec."ScheduleEnabled";
        p_MJRecordProcesses_AgentID_CronExpression := _rec."CronExpression";
        p_MJRecordProcesses_AgentID_Timezone := _rec."Timezone";
        p_MJRecordProcesses_AgentID_OnDemandEnabled := _rec."OnDemandEnabled";
        p_MJRecordProcesses_AgentID_InputMapping := _rec."InputMapping";
        p_MJRecordProcesses_AgentID_OutputMapping := _rec."OutputMapping";
        p_MJRecordProcesses_AgentID_SkipUnchanged := _rec."SkipUnchanged";
        p_MJRecordProcesses_AgentID_WatermarkStrategy := _rec."WatermarkStrategy";
        p_MJRecordProcesses_AgentID_BatchSize := _rec."BatchSize";
        p_MJRecordProcesses_AgentID_MaxConcurrency := _rec."MaxConcurrency";
        p_MJRecordProcesses_AgentID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJRecordProcesses_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateRecordProcess"(p_ID => p_MJRecordProcesses_AgentIDID, p_Name => p_MJRecordProcesses_AgentID_Name, p_Description => p_MJRecordProcesses_AgentID_Description, p_CategoryID => p_MJRecordProcesses_AgentID_CategoryID, p_EntityID => p_MJRecordProcesses_AgentID_EntityID, p_Status => p_MJRecordProcesses_AgentID_Status, p_WorkType => p_MJRecordProcesses_AgentID_WorkType, p_ActionID => p_MJRecordProcesses_AgentID_ActionID, p_AgentID_Clear => 1, p_AgentID => p_MJRecordProcesses_AgentID_AgentID, p_PromptID => p_MJRecordProcesses_AgentID_PromptID, p_ScopeType => p_MJRecordProcesses_AgentID_ScopeType, p_ScopeViewID => p_MJRecordProcesses_AgentID_ScopeViewID, p_ScopeListID => p_MJRecordProcesses_AgentID_ScopeListID, p_ScopeFilter => p_MJRecordProcesses_AgentID_ScopeFilter, p_OnChangeEnabled => p_MJRecordProcesses_AgentID_OnChangeEnabled, p_OnChangeInvocationType => p_MJRecordProcesses_AgentID_OnChangeInvocationType, p_OnChangeFilter => p_MJRecordProcesses_AgentID_OnChangeFilter, p_ScheduleEnabled => p_MJRecordProcesses_AgentID_ScheduleEnabled, p_CronExpression => p_MJRecordProcesses_AgentID_CronExpression, p_Timezone => p_MJRecordProcesses_AgentID_Timezone, p_OnDemandEnabled => p_MJRecordProcesses_AgentID_OnDemandEnabled, p_InputMapping => p_MJRecordProcesses_AgentID_InputMapping, p_OutputMapping => p_MJRecordProcesses_AgentID_OutputMapping, p_SkipUnchanged => p_MJRecordProcesses_AgentID_SkipUnchanged, p_WatermarkStrategy => p_MJRecordProcesses_AgentID_WatermarkStrategy, p_BatchSize => p_MJRecordProcesses_AgentID_BatchSize, p_MaxConcurrency => p_MJRecordProcesses_AgentID_MaxConcurrency, p_Configuration => p_MJRecordProcesses_AgentID_Configuration);

    END LOOP;

    
    -- Cascade update on SearchExecutionLog using cursor to call spUpdateSearchExecutionLog


    FOR _rec IN SELECT "ID", "SearchScopeID", "UserID", "AIAgentID", "Query", "TotalDurationMs", "ResultCount", "RerankerName", "RerankerCostCents", "Status", "FailureReason", "ProvidersJSON" FROM __mj."SearchExecutionLog" WHERE "AIAgentID" = p_ID
    LOOP
        p_MJSearchExecutionLogs_AIAgentIDID := _rec."ID";
        p_MJSearchExecutionLogs_AIAgentID_SearchScopeID := _rec."SearchScopeID";
        p_MJSearchExecutionLogs_AIAgentID_UserID := _rec."UserID";
        p_MJSearchExecutionLogs_AIAgentID_AIAgentID := _rec."AIAgentID";
        p_MJSearchExecutionLogs_AIAgentID_Query := _rec."Query";
        p_MJSearchExecutionLogs_AIAgentID_TotalDurationMs := _rec."TotalDurationMs";
        p_MJSearchExecutionLogs_AIAgentID_ResultCount := _rec."ResultCount";
        p_MJSearchExecutionLogs_AIAgentID_RerankerName := _rec."RerankerName";
        p_MJSearchExecutionLogs_AIAgentID_RerankerCostCents := _rec."RerankerCostCents";
        p_MJSearchExecutionLogs_AIAgentID_Status := _rec."Status";
        p_MJSearchExecutionLogs_AIAgentID_FailureReason := _rec."FailureReason";
        p_MJSearchExecutionLogs_AIAgentID_ProvidersJSON := _rec."ProvidersJSON";
        -- Set the FK field to NULL
        p_MJSearchExecutionLogs_AIAgentID_AIAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateSearchExecutionLog"(p_ID => p_MJSearchExecutionLogs_AIAgentIDID, p_SearchScopeID => p_MJSearchExecutionLogs_AIAgentID_SearchScopeID, p_UserID => p_MJSearchExecutionLogs_AIAgentID_UserID, p_AIAgentID_Clear => 1, p_AIAgentID => p_MJSearchExecutionLogs_AIAgentID_AIAgentID, p_Query => p_MJSearchExecutionLogs_AIAgentID_Query, p_TotalDurationMs => p_MJSearchExecutionLogs_AIAgentID_TotalDurationMs, p_ResultCount => p_MJSearchExecutionLogs_AIAgentID_ResultCount, p_RerankerName => p_MJSearchExecutionLogs_AIAgentID_RerankerName, p_RerankerCostCents => p_MJSearchExecutionLogs_AIAgentID_RerankerCostCents, p_Status => p_MJSearchExecutionLogs_AIAgentID_Status, p_FailureReason => p_MJSearchExecutionLogs_AIAgentID_FailureReason, p_ProvidersJSON => p_MJSearchExecutionLogs_AIAgentID_ProvidersJSON);

    END LOOP;

    
    -- Cascade update on Task using cursor to call spUpdateTask


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt" FROM __mj."Task" WHERE "AgentID" = p_ID
    LOOP
        p_MJTasks_AgentIDID := _rec."ID";
        p_MJTasks_AgentID_ParentID := _rec."ParentID";
        p_MJTasks_AgentID_Name := _rec."Name";
        p_MJTasks_AgentID_Description := _rec."Description";
        p_MJTasks_AgentID_TypeID := _rec."TypeID";
        p_MJTasks_AgentID_EnvironmentID := _rec."EnvironmentID";
        p_MJTasks_AgentID_ProjectID := _rec."ProjectID";
        p_MJTasks_AgentID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJTasks_AgentID_UserID := _rec."UserID";
        p_MJTasks_AgentID_AgentID := _rec."AgentID";
        p_MJTasks_AgentID_Status := _rec."Status";
        p_MJTasks_AgentID_PercentComplete := _rec."PercentComplete";
        p_MJTasks_AgentID_DueAt := _rec."DueAt";
        p_MJTasks_AgentID_StartedAt := _rec."StartedAt";
        p_MJTasks_AgentID_CompletedAt := _rec."CompletedAt";
        -- Set the FK field to NULL
        p_MJTasks_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_AgentIDID, p_ParentID => p_MJTasks_AgentID_ParentID, p_Name => p_MJTasks_AgentID_Name, p_Description => p_MJTasks_AgentID_Description, p_TypeID => p_MJTasks_AgentID_TypeID, p_EnvironmentID => p_MJTasks_AgentID_EnvironmentID, p_ProjectID => p_MJTasks_AgentID_ProjectID, p_ConversationDetailID => p_MJTasks_AgentID_ConversationDetailID, p_UserID => p_MJTasks_AgentID_UserID, p_AgentID_Clear => 1, p_AgentID => p_MJTasks_AgentID_AgentID, p_Status => p_MJTasks_AgentID_Status, p_PercentComplete => p_MJTasks_AgentID_PercentComplete, p_DueAt => p_MJTasks_AgentID_DueAt, p_StartedAt => p_MJTasks_AgentID_StartedAt, p_CompletedAt => p_MJTasks_AgentID_CompletedAt);

    END LOOP;

    

    DELETE FROM
        __mj."AIAgent"
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
           WHERE proname = 'spDeleteApplication'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteApplication"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJApplicationEntities_ApplicationIDID UUID;
    p_MJApplicationRoles_ApplicationIDID UUID;
    p_MJApplicationSettings_ApplicationIDID UUID;
    p_MJConversationWidgetInstances_ApplicationIDID UUID;
    p_MJConversations_ApplicationIDID UUID;
    p_MJConversations_ApplicationID_UserID UUID;
    p_MJConversations_ApplicationID_ExternalID VARCHAR(500);
    p_MJConversations_ApplicationID_Name VARCHAR(255);
    p_MJConversations_ApplicationID_Description TEXT;
    p_MJConversations_ApplicationID_Type VARCHAR(50);
    p_MJConversations_ApplicationID_IsArchived BOOLEAN;
    p_MJConversations_ApplicationID_LinkedEntityID UUID;
    p_MJConversations_ApplicationID_LinkedRecordID VARCHAR(500);
    p_MJConversations_ApplicationID_DataContextID UUID;
    p_MJConversations_ApplicationID_Status VARCHAR(20);
    p_MJConversations_ApplicationID_EnvironmentID UUID;
    p_MJConversations_ApplicationID_ProjectID UUID;
    p_MJConversations_ApplicationID_IsPinned BOOLEAN;
    p_MJConversations_ApplicationID_TestRunID UUID;
    p_MJConversations_ApplicationID_ApplicationScope VARCHAR(20);
    p_MJConversations_ApplicationID_ApplicationID UUID;
    p_MJConversations_ApplicationID_DefaultAgentID UUID;
    p_MJConversations_ApplicationID_AdditionalData TEXT;
    p_MJConversations_ApplicationID_RecordingFileID UUID;
    p_MJConversations_ApplicationID_EgressID VARCHAR(255);
    p_MJConversations_ApplicationID_VisitorKey VARCHAR(255);
    p_MJConversations_ApplicationID_LastConversationID UUID;
    p_MJDashboardUserPreferences_ApplicationIDID UUID;
    p_MJDashboards_ApplicationIDID UUID;
    p_MJDashboards_ApplicationID_Name VARCHAR(255);
    p_MJDashboards_ApplicationID_Description TEXT;
    p_MJDashboards_ApplicationID_UserID UUID;
    p_MJDashboards_ApplicationID_CategoryID UUID;
    p_MJDashboards_ApplicationID_UIConfigDetails TEXT;
    p_MJDashboards_ApplicationID_Type VARCHAR(20);
    p_MJDashboards_ApplicationID_Thumbnail TEXT;
    p_MJDashboards_ApplicationID_Scope VARCHAR(20);
    p_MJDashboards_ApplicationID_ApplicationID UUID;
    p_MJDashboards_ApplicationID_DriverClass VARCHAR(255);
    p_MJDashboards_ApplicationID_Code VARCHAR(255);
    p_MJDashboards_ApplicationID_EnvironmentID UUID;
    p_MJMagicLinkInviteApplications_ApplicationIDID UUID;
    p_MJMagicLinkInvites_ApplicationIDID UUID;
    p_MJUserApplications_ApplicationIDID UUID;
BEGIN
-- Cascade delete from ApplicationEntity using cursor to call spDeleteApplicationEntity

    FOR _rec IN SELECT "ID" FROM __mj."ApplicationEntity" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJApplicationEntities_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteApplicationEntity"(p_ID => p_MJApplicationEntities_ApplicationIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ApplicationRole using cursor to call spDeleteApplicationRole

    FOR _rec IN SELECT "ID" FROM __mj."ApplicationRole" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJApplicationRoles_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteApplicationRole"(p_ID => p_MJApplicationRoles_ApplicationIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ApplicationSetting using cursor to call spDeleteApplicationSetting

    FOR _rec IN SELECT "ID" FROM __mj."ApplicationSetting" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJApplicationSettings_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteApplicationSetting"(p_ID => p_MJApplicationSettings_ApplicationIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ConversationWidgetInstance using cursor to call spDeleteConversationWidgetInstance

    FOR _rec IN SELECT "ID" FROM __mj."ConversationWidgetInstance" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJConversationWidgetInstances_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationWidgetInstance"(p_ID => p_MJConversationWidgetInstances_ApplicationIDID);
        
    END LOOP;
    
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation


    FOR _rec IN SELECT "ID", "UserID", "ExternalID", "Name", "Description", "Type", "IsArchived", "LinkedEntityID", "LinkedRecordID", "DataContextID", "Status", "EnvironmentID", "ProjectID", "IsPinned", "TestRunID", "ApplicationScope", "ApplicationID", "DefaultAgentID", "AdditionalData", "RecordingFileID", "EgressID", "VisitorKey", "LastConversationID" FROM __mj."Conversation" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJConversations_ApplicationIDID := _rec."ID";
        p_MJConversations_ApplicationID_UserID := _rec."UserID";
        p_MJConversations_ApplicationID_ExternalID := _rec."ExternalID";
        p_MJConversations_ApplicationID_Name := _rec."Name";
        p_MJConversations_ApplicationID_Description := _rec."Description";
        p_MJConversations_ApplicationID_Type := _rec."Type";
        p_MJConversations_ApplicationID_IsArchived := _rec."IsArchived";
        p_MJConversations_ApplicationID_LinkedEntityID := _rec."LinkedEntityID";
        p_MJConversations_ApplicationID_LinkedRecordID := _rec."LinkedRecordID";
        p_MJConversations_ApplicationID_DataContextID := _rec."DataContextID";
        p_MJConversations_ApplicationID_Status := _rec."Status";
        p_MJConversations_ApplicationID_EnvironmentID := _rec."EnvironmentID";
        p_MJConversations_ApplicationID_ProjectID := _rec."ProjectID";
        p_MJConversations_ApplicationID_IsPinned := _rec."IsPinned";
        p_MJConversations_ApplicationID_TestRunID := _rec."TestRunID";
        p_MJConversations_ApplicationID_ApplicationScope := _rec."ApplicationScope";
        p_MJConversations_ApplicationID_ApplicationID := _rec."ApplicationID";
        p_MJConversations_ApplicationID_DefaultAgentID := _rec."DefaultAgentID";
        p_MJConversations_ApplicationID_AdditionalData := _rec."AdditionalData";
        p_MJConversations_ApplicationID_RecordingFileID := _rec."RecordingFileID";
        p_MJConversations_ApplicationID_EgressID := _rec."EgressID";
        p_MJConversations_ApplicationID_VisitorKey := _rec."VisitorKey";
        p_MJConversations_ApplicationID_LastConversationID := _rec."LastConversationID";
        -- Set the FK field to NULL
        p_MJConversations_ApplicationID_ApplicationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversation"(p_ID => p_MJConversations_ApplicationIDID, p_UserID => p_MJConversations_ApplicationID_UserID, p_ExternalID => p_MJConversations_ApplicationID_ExternalID, p_Name => p_MJConversations_ApplicationID_Name, p_Description => p_MJConversations_ApplicationID_Description, p_Type => p_MJConversations_ApplicationID_Type, p_IsArchived => p_MJConversations_ApplicationID_IsArchived, p_LinkedEntityID => p_MJConversations_ApplicationID_LinkedEntityID, p_LinkedRecordID => p_MJConversations_ApplicationID_LinkedRecordID, p_DataContextID => p_MJConversations_ApplicationID_DataContextID, p_Status => p_MJConversations_ApplicationID_Status, p_EnvironmentID => p_MJConversations_ApplicationID_EnvironmentID, p_ProjectID => p_MJConversations_ApplicationID_ProjectID, p_IsPinned => p_MJConversations_ApplicationID_IsPinned, p_TestRunID => p_MJConversations_ApplicationID_TestRunID, p_ApplicationScope => p_MJConversations_ApplicationID_ApplicationScope, p_ApplicationID_Clear => 1, p_ApplicationID => p_MJConversations_ApplicationID_ApplicationID, p_DefaultAgentID => p_MJConversations_ApplicationID_DefaultAgentID, p_AdditionalData => p_MJConversations_ApplicationID_AdditionalData, p_RecordingFileID => p_MJConversations_ApplicationID_RecordingFileID, p_EgressID => p_MJConversations_ApplicationID_EgressID, p_VisitorKey => p_MJConversations_ApplicationID_VisitorKey, p_LastConversationID => p_MJConversations_ApplicationID_LastConversationID);

    END LOOP;

    
    -- Cascade delete from DashboardUserPreference using cursor to call spDeleteDashboardUserPreference

    FOR _rec IN SELECT "ID" FROM __mj."DashboardUserPreference" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJDashboardUserPreferences_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteDashboardUserPreference"(p_ID => p_MJDashboardUserPreferences_ApplicationIDID);
        
    END LOOP;
    
    
    -- Cascade update on Dashboard using cursor to call spUpdateDashboard


    FOR _rec IN SELECT "ID", "Name", "Description", "UserID", "CategoryID", "UIConfigDetails", "Type", "Thumbnail", "Scope", "ApplicationID", "DriverClass", "Code", "EnvironmentID" FROM __mj."Dashboard" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJDashboards_ApplicationIDID := _rec."ID";
        p_MJDashboards_ApplicationID_Name := _rec."Name";
        p_MJDashboards_ApplicationID_Description := _rec."Description";
        p_MJDashboards_ApplicationID_UserID := _rec."UserID";
        p_MJDashboards_ApplicationID_CategoryID := _rec."CategoryID";
        p_MJDashboards_ApplicationID_UIConfigDetails := _rec."UIConfigDetails";
        p_MJDashboards_ApplicationID_Type := _rec."Type";
        p_MJDashboards_ApplicationID_Thumbnail := _rec."Thumbnail";
        p_MJDashboards_ApplicationID_Scope := _rec."Scope";
        p_MJDashboards_ApplicationID_ApplicationID := _rec."ApplicationID";
        p_MJDashboards_ApplicationID_DriverClass := _rec."DriverClass";
        p_MJDashboards_ApplicationID_Code := _rec."Code";
        p_MJDashboards_ApplicationID_EnvironmentID := _rec."EnvironmentID";
        -- Set the FK field to NULL
        p_MJDashboards_ApplicationID_ApplicationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateDashboard"(p_ID => p_MJDashboards_ApplicationIDID, p_Name => p_MJDashboards_ApplicationID_Name, p_Description => p_MJDashboards_ApplicationID_Description, p_UserID => p_MJDashboards_ApplicationID_UserID, p_CategoryID => p_MJDashboards_ApplicationID_CategoryID, p_UIConfigDetails => p_MJDashboards_ApplicationID_UIConfigDetails, p_Type => p_MJDashboards_ApplicationID_Type, p_Thumbnail => p_MJDashboards_ApplicationID_Thumbnail, p_Scope => p_MJDashboards_ApplicationID_Scope, p_ApplicationID_Clear => 1, p_ApplicationID => p_MJDashboards_ApplicationID_ApplicationID, p_DriverClass => p_MJDashboards_ApplicationID_DriverClass, p_Code => p_MJDashboards_ApplicationID_Code, p_EnvironmentID => p_MJDashboards_ApplicationID_EnvironmentID);

    END LOOP;

    
    -- Cascade delete from MagicLinkInviteApplication using cursor to call spDeleteMagicLinkInviteApplication

    FOR _rec IN SELECT "ID" FROM __mj."MagicLinkInviteApplication" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJMagicLinkInviteApplications_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteMagicLinkInviteApplication"(p_ID => p_MJMagicLinkInviteApplications_ApplicationIDID);
        
    END LOOP;
    
    
    -- Cascade delete from MagicLinkInvite using cursor to call spDeleteMagicLinkInvite

    FOR _rec IN SELECT "ID" FROM __mj."MagicLinkInvite" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJMagicLinkInvites_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteMagicLinkInvite"(p_ID => p_MJMagicLinkInvites_ApplicationIDID);
        
    END LOOP;
    
    
    -- Cascade delete from UserApplication using cursor to call spDeleteUserApplication

    FOR _rec IN SELECT "ID" FROM __mj."UserApplication" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJUserApplications_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteUserApplication"(p_ID => p_MJUserApplications_ApplicationIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."Application"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentNote_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentNote" ON __mj."AIAgentNote";
CREATE TRIGGER "trgUpdateAIAgentNote"
    BEFORE UPDATE ON __mj."AIAgentNote"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentNote_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentSession_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentSession" ON __mj."AIAgentSession";
CREATE TRIGGER "trgUpdateAIAgentSession"
    BEFORE UPDATE ON __mj."AIAgentSession"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentSession_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateConversationWidgetInstance_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateConversationWidgetInstance" ON __mj."ConversationWidgetInstance";
CREATE TRIGGER "trgUpdateConversationWidgetInstance"
    BEFORE UPDATE ON __mj."ConversationWidgetInstance"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateConversationWidgetInstance_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateConversation_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateConversation" ON __mj."Conversation";
CREATE TRIGGER "trgUpdateConversation"
    BEFORE UPDATE ON __mj."Conversation"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateConversation_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = 'A1E6D2C4-4F1B-4C7E-9E3A-1D2B3C4D5E6F'
    ) THEN
        INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "FilterText", "Description")
        VALUES (
        'A1E6D2C4-4F1B-4C7E-9E3A-1D2B3C4D5E6F',
        'Widget Guest: Own Conversations',
        'ExternalID = ''{{ScopeResourceID}}''',
        'Isolates a public web-widget guest to its OWN conversations. Conversations are stamped with ExternalID = the opaque per-session id at create time; this filter restricts reads/updates to rows matching the session scope ({{ScopeResourceID}}) carried on the signed guest token. Attached to the Widget Guest role''s read+update permission on Conversations so two anonymous guests sharing the Anonymous principal cannot see each other''s conversations.'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = 'B2F7E3D5-5A2C-4D8F-AF4B-2E3C4D5E6F70'
    ) THEN
        INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "FilterText", "Description")
        VALUES (
        'B2F7E3D5-5A2C-4D8F-AF4B-2E3C4D5E6F70',
        'Widget Guest: Own Conversation Details',
        'ConversationID IN (SELECT ID FROM __mj.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')',
        'Isolates a public web-widget guest to the messages of its OWN conversations. Scopes Conversation Details by the parent conversation''s ExternalID (matched against the session scope {{ScopeResourceID}} on the signed guest token) rather than the detail''s own ExternalID — so the agent''s AI-reply details (which carry no ExternalID) stay visible to the owning session while remaining hidden from other guests. Attached to the Widget Guest role''s read+update permission on Conversation Details.'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = 'B1E7C0A2-3D4F-4A5B-8C6D-7E8F9A0B1C2D'
    ) THEN
        INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "FilterText", "Description")
        VALUES (
        'B1E7C0A2-3D4F-4A5B-8C6D-7E8F9A0B1C2D',
        'Widget Guest: Own Agent Sessions',
        'ConversationID IN (SELECT ID FROM __mj.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')',
        'Isolates a public web-widget VOICE guest to its OWN realtime agent sessions. A session''s Conversation is stamped with ExternalID = the opaque per-session id at create time; this filter restricts reads/updates of MJ: AI Agent Sessions to rows whose Conversation matches the session scope ({{ScopeResourceID}}) carried on the signed guest token. Attached to the Widget Guest role''s read+update permission on AI Agent Sessions so two anonymous guests sharing the Anonymous principal cannot see each other''s sessions.'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = 'C2F8D1B3-4E5A-4B6C-9D7E-8F0A1B2C3D4E'
    ) THEN
        INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "FilterText", "Description")
        VALUES (
        'C2F8D1B3-4E5A-4B6C-9D7E-8F0A1B2C3D4E',
        'Widget Guest: Own Agent Session Channels',
        'AgentSessionID IN (SELECT ID FROM __mj.vwAIAgentSessions WHERE ConversationID IN (SELECT ID FROM __mj.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}''))',
        'Isolates a public web-widget VOICE guest to the channels of its OWN realtime agent sessions. Scopes MJ: AI Agent Session Channels by the parent session''s Conversation ExternalID (matched against the session scope {{ScopeResourceID}} on the signed guest token). Attached to the Widget Guest role''s read+update permission on AI Agent Session Channels.'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = 'D3A9E2C4-5F6B-4C7D-AE8F-9A0B1C2D3E4F'
    ) THEN
        INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "FilterText", "Description")
        VALUES (
        'D3A9E2C4-5F6B-4C7D-AE8F-9A0B1C2D3E4F',
        'Widget Guest: Widget-Pinned Agents',
        'ID IN (SELECT PinnedAgentID FROM __mj.vwConversationWidgetInstances WHERE Status = ''Active'' AND PinnedAgentID IS NOT NULL)',
        'Restricts a public web-widget guest to reading ONLY the agents pinned to an active widget instance (the agents intentionally exposed to the public), never the full internal agent roster. Attached to the Widget Guest role''s read permission on MJ: AI Agents so the client-side ConversationsRuntime can resolve the pinned agent without exposing other agents.'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = '48078109-E006-456D-A877-F254EA447B34'
    ) THEN
        INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "FilterText", "Description")
        VALUES (
        '48078109-E006-456D-A877-F254EA447B34',
        'Widget Guest: Own Agent Runs',
        'ConversationID IN (SELECT ID FROM __mj.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')',
        'Isolates a public web-widget guest to its OWN AI run rows (MJ: AI Agent Runs / AI Agent Run Steps / AI Prompt Runs). All three carry a ConversationID; a guest''s session Conversation is stamped with ExternalID = the opaque per-session scope ({{ScopeResourceID}}) carried on the signed guest token, so this filter restricts reads to runs belonging to the guest''s own session. Closes the cross-guest read leak from the previous unscoped grants. The text path runs the agent under a trusted server principal (no guest run writes); the voice path still writes runs under the guest, and this filter scopes their reads. Attached to the Widget Guest role''s read permission on those three run entities.'
        );
    END IF;
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
         '88026538-d440-48f5-9fe8-a8a7198dbf83',
         'MJ: Conversation Widget Instances',
         'Conversation Widget Instances',
         'Durable per-deployment configuration for one embeddable public support widget (text and/or voice). One row per site/embed. Resolves a public widget key to its application scope, pinned support agent, restricted guest role, allowed origins, modality, auth strategy, and abuse ceilings. Reuses the magic-link anonymous-embed minting path at session time; this entity holds only the configuration.',
         NULL,
         'ConversationWidgetInstance',
         'vwConversationWidgetInstances',
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

/* SQL generated to add new entity MJ: Conversation Widget Instances to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '88026538-d440-48f5-9fe8-a8a7198dbf83', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Conversation Widget Instances for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('88026538-d440-48f5-9fe8-a8a7198dbf83', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Conversation Widget Instances for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('88026538-d440-48f5-9fe8-a8a7198dbf83', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Conversation Widget Instances for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('88026538-d440-48f5-9fe8-a8a7198dbf83', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ConversationWidgetInstance" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ConversationWidgetInstance" */
UPDATE __mj."ConversationWidgetInstance" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ConversationWidgetInstance */
ALTER TABLE __mj."ConversationWidgetInstance" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ConversationWidgetInstance"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ConversationWidgetInstance" */
UPDATE __mj."ConversationWidgetInstance" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ConversationWidgetInstance */
ALTER TABLE __mj."ConversationWidgetInstance" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ConversationWidgetInstance"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '042ab9a6-963b-4f43-b4ae-862f83446494' OR ("EntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'VisitorKey')
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
        '042ab9a6-963b-4f43-b4ae-862f83446494',
        '13248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Conversations"
        100058,
        'VisitorKey',
        'Visitor Key',
        'Durable, opaque returning-visitor anchor (R3). Holds the value of a long-lived first-party cookie minted by the widget on first visit, used to find this visitor''s prior conversations while they are still anonymous. Distinct from ExternalID (which stays per-session for RLS isolation). NULL for conversations that are not widget returning-visitor sessions.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '879e3427-c9b6-4d2b-93e0-3bf6adfcd361' OR ("EntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'LastConversationID')
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
        '879e3427-c9b6-4d2b-93e0-3bf6adfcd361',
        '13248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Conversations"
        100059,
        'LastConversationID',
        'Last Conversation ID',
        'Conversation-altitude returning-visitor chain (R2). Self-foreign-key to the visitor''s immediately prior Conversation (found by VisitorKey or the resolved LinkedEntityID/LinkedRecordID pair at mint time). History and memory are conversation-scoped, so the chain lives here — NOT on AIAgentSession.LastSessionID, which owns reconnect/resume semantics and is walked by the replay viewer. Named to mirror AIAgentSession.LastSessionID. NULL for a brand-new visitor''s first conversation.',
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
        '13248F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '39d168d2-f07b-4d85-bb95-08cb2d786e0f' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'LinkedEntityID')
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
        '39d168d2-f07b-4d85-bb95-08cb2d786e0f',
        '17198778-E25A-4457-80AF-9E8C4961DC29', -- "Entity": "MJ": "AI" "Agent" "Sessions"
        100047,
        'LinkedEntityID',
        'Linked Entity ID',
        'Polymorphic counterparty-identity entity. Foreign key to Entity — identifies WHICH entity this realtime session''s counterparty resolved to (e.g. User, a member/contact record, BizAppsCommon Person). Paired with LinkedRecordID via the CK_AIAgentSession_LinkBinding both-or-neither check, mirroring Conversation''s linked pair. NULL while the session''s counterparty is anonymous/unresolved.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f69e7371-7f9c-4c91-a5fe-ca430f295583' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'LinkedRecordID')
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
        'f69e7371-7f9c-4c91-a5fe-ca430f295583',
        '17198778-E25A-4457-80AF-9E8C4961DC29', -- "Entity": "MJ": "AI" "Agent" "Sessions"
        100041,
        'LinkedRecordID',
        'Linked Record ID',
        'Polymorphic counterparty-identity record key. The primary-key value of the record (within LinkedEntityID''s entity) this session resolved to, serialized as a string so any entity type can be referenced regardless of PK shape (UUID, INTEGER, composite). VARCHAR(500), intentionally NOT FK-constrained. Used together with LinkedEntityID — see CK_AIAgentSession_LinkBinding. NULL while the session''s counterparty is anonymous/unresolved.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ffa3e465-0582-48b4-906a-a5997c8a0803' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'ID')
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
        'ffa3e465-0582-48b4-906a-a5997c8a0803',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'adaa0676-b5e6-458c-aec2-2b1bd6b12242' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'Name')
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
        'adaa0676-b5e6-458c-aec2-2b1bd6b12242',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100002,
        'Name',
        'Name',
        'Human-readable name for this widget deployment (e.g. "Acme Marketing Site Support").',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a377bb89-2a5e-42e5-aeae-933c0835dcfd' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'PublicKey')
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
        'a377bb89-2a5e-42e5-aeae-933c0835dcfd',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100003,
        'PublicKey',
        'Public Key',
        'Public, non-secret embed key (e.g. "pk_live_…") placed in the host page''s data-widget-key attribute. Used to resolve this configuration at POST /widget/session. Unique. Not a credential — security comes from the origin allowlist, rate limits, the restricted guest role, and short-lived minted tokens.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1f8c1246-6551-4f5d-a18c-5ba817c701e2' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'ApplicationID')
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
        '1f8c1246-6551-4f5d-a18c-5ba817c701e2',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100004,
        'ApplicationID',
        'Application ID',
        'Foreign key to Application — the single app a guest session is scoped to. Mirrors the magic-link single-application model.',
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
        'E8238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6e099daf-45d2-4908-9230-5af734a3b330' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'PinnedAgentID')
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
        '6e099daf-45d2-4908-9230-5af734a3b330',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100005,
        'PinnedAgentID',
        'Pinned Agent ID',
        'Foreign key to AIAgent — the support agent that is PINNED for every turn (passed as explicitAgentId). D5: pinning fixes which agent runs; combined with the restricted guest role it prevents a public visitor from reaching arbitrary agents/data. The pinned agent''s own tool/handoff surface should be support-scoped.',
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
        'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7e6f8dfd-272e-4336-9def-c8fc5c8ee5d9' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'GuestRoleID')
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
        '7e6f8dfd-272e-4336-9def-c8fc5c8ee5d9',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100006,
        'GuestRoleID',
        'Guest Role ID',
        'Foreign key to Role — the restricted guest role assigned to the synthesized guest principal. This role''s entity permissions are the real authorization boundary (read/write only the visitor''s own Conversation + Conversation Details). Roles ride per-session JWT claims, not DB rows on the shared Anonymous principal.',
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
        'DA238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '75923530-6de5-41bd-9615-7c72b5a69510' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'AllowedOrigins')
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
        '75923530-6de5-41bd-9615-7c72b5a69510',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100007,
        'AllowedOrigins',
        'Allowed Origins',
        'Allowed embedding origins for this widget, as a JSON array of origin strings (e.g. ["https://www.acme.com","https://acme.com"]). Enforced both at mint (POST /widget/session rejects unlisted Origin) and via CORS. NULL or empty means no origin is allowed (fail-closed).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9714d30c-a9e7-4cb3-bb2e-c7dc5f5dd094' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'Modality')
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
        '9714d30c-a9e7-4cb3-bb2e-c7dc5f5dd094',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100008,
        'Modality',
        'Modality',
        'Which modalities this widget exposes: Text (chat only), Voice (client-direct realtime only), or Both. Gates whether the realtime-mint path is offered to the guest.',
        'TEXT',
        20,
        0,
        0,
        FALSE,
        'Text',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '34794587-43d0-451c-9846-aeda0dfcee58' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'AuthStrategy')
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
        '34794587-43d0-451c-9846-aeda0dfcee58',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100009,
        'AuthStrategy',
        'Auth Strategy',
        'Pluggable public-auth strategy (D1): Anonymous (guest-first, default), MagicLinkUpgrade (guest may escalate to an email-verified session), or HostIdentity (an authenticated host portal posts a signed identity assertion exchanged for an MJ guest JWT). All three converge on AuthProviderFactory + buildMagicLinkSessionUser.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Anonymous',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cdad88b3-02d2-48f7-bd2a-5dc15ce9ea37' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'Status')
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
        'cdad88b3-02d2-48f7-bd2a-5dc15ce9ea37',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100010,
        'Status',
        'Status',
        'Lifecycle status. Active widgets mint sessions; Disabled widgets reject all mints (used to turn off a deployment without deleting its config).',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Active',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '54a96afe-a5f0-4956-85f4-d02b5a4fd83f' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'SessionTTLMinutes')
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
        '54a96afe-a5f0-4956-85f4-d02b5a4fd83f',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100011,
        'SessionTTLMinutes',
        'Session TTL Minutes',
        'Time-to-live in minutes for a minted guest session JWT. Short by design (default 15) to limit replay/theft; the widget refreshes before expiry. Capped at 1440 (24h).',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(15)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fa99f64e-2902-4926-9ea4-1c8e45931ebc' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'RateLimitPerMinute')
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
        'fa99f64e-2902-4926-9ea4-1c8e45931ebc',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100012,
        'RateLimitPerMinute',
        'Rate Limit Per Minute',
        'Maximum number of guest-session mints allowed per minute per source IP/origin for this widget. Reuses the magic-link rate-limit pattern.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(30)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1acea033-d135-436c-8c03-ea506dae37b0' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'VoiceMaxSessionMinutes')
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
        '1acea033-d135-436c-8c03-ea506dae37b0',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100013,
        'VoiceMaxSessionMinutes',
        'Voice Max Session Minutes',
        'Optional hard ceiling (minutes) on a single voice session''s duration for this widget. NULL means fall back to the server-wide default. Voice is the biggest cost/abuse surface; the SessionJanitor enforces this server-side (W4).',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a78c2af9-8d4f-4ca6-931a-66b419de8d13' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'EnabledChannels')
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
        'a78c2af9-8d4f-4ca6-931a-66b419de8d13',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100014,
        'EnabledChannels',
        'Enabled Channels',
        'Which MJ interactive channels this widget may attach when a voice session is active, as a JSON array of channel names (e.g. ["Whiteboard"]). Resolved client-side through MJGlobal.ClassFactory the same way the realtime client driver is resolved; each named channel is scoped by the existing Widget Guest RLS on AI Agent Session Channels. NULL or empty array = no channels (the backwards-compatible default). Remote Browser, given its control surface, should only be listed when a deployment explicitly opts in.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '42a9864d-15fc-4edc-8fd0-8fa6b7fabefe' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'HostPublicKey')
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
        '42a9864d-15fc-4edc-8fd0-8fa6b7fabefe',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100015,
        'HostPublicKey',
        'Host Public Key',
        'PEM-encoded RS256 public key for the host-identity auth strategy (D1). When AuthStrategy is HostIdentity, the host signs a short-lived identity assertion with its private key; the HostIdentityProvider verifies it against this per-instance key. Supersedes the interim config map (mj.config.cjs hostPublicKeys keyed by PublicKey). NULL when the widget does not use host identity; a HostIdentity widget with no key fails closed at mint.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c8227149-3534-4ac9-8c28-908893ba2c2c' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'RememberReturningVisitors')
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
        'c8227149-3534-4ac9-8c28-908893ba2c2c',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100016,
        'RememberReturningVisitors',
        'Remember Returning Visitors',
        'Returning-visitor memory opt-in (R6). When 0 (default) this widget sets no durable visitor cookie and writes no cross-session recap — fully off. When 1, the widget mints a durable VisitorKey cookie, links each new Conversation to the visitor''s prior one, and writes a recap memory note on close so a returning visitor''s agent opens with prior context.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8773c7a4-317a-4947-b9f5-346dc7cdaba5' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'VisitorMemoryRetentionDays')
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
        '8773c7a4-317a-4947-b9f5-346dc7cdaba5',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100017,
        'VisitorMemoryRetentionDays',
        'Visitor Memory Retention Days',
        'Retention window (days) for returning-visitor recap memory notes generated by this widget. NULL means use the system default. Past this window the visitor''s auto-generated recap notes decay/archive via the Memory Manager. Ignored when RememberReturningVisitors = 0.',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'de3f0e6c-e5e3-47df-9880-92ded0c24085' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = '__mj_CreatedAt')
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
        'de3f0e6c-e5e3-47df-9880-92ded0c24085',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100018,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4163b93b-f43e-42e0-bdd4-01160b1f42ca' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = '__mj_UpdatedAt')
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
        '4163b93b-f43e-42e0-bdd4-01160b1f42ca',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100019,
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
                                       ('d3cd4d4b-b061-4061-875a-9f0e993fc6bb', '9714D30C-A9E7-4CB3-BB2E-C7DC5F5DD094', 1, 'Both', 'Both', NOW(), NOW());

/* SQL text to insert entity field value with ID 106b27cf-5dd2-46f3-9794-76915e40b05c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('106b27cf-5dd2-46f3-9794-76915e40b05c', '9714D30C-A9E7-4CB3-BB2E-C7DC5F5DD094', 2, 'Text', 'Text', NOW(), NOW());

/* SQL text to insert entity field value with ID 58320a02-fe38-4eec-a460-1c4ded2dd519 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('58320a02-fe38-4eec-a460-1c4ded2dd519', '9714D30C-A9E7-4CB3-BB2E-C7DC5F5DD094', 3, 'Voice', 'Voice', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 9714D30C-A9E7-4CB3-BB2E-C7DC5F5DD094 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='9714D30C-A9E7-4CB3-BB2E-C7DC5F5DD094';

/* SQL text to insert entity field value with ID 43853eb9-44e2-4d07-a56a-d6fbebf38101 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('43853eb9-44e2-4d07-a56a-d6fbebf38101', '34794587-43D0-451C-9846-AEDA0DFCEE58', 1, 'Anonymous', 'Anonymous', NOW(), NOW());

/* SQL text to insert entity field value with ID bda27514-032f-4785-87c5-b9a6e9148ece */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('bda27514-032f-4785-87c5-b9a6e9148ece', '34794587-43D0-451C-9846-AEDA0DFCEE58', 2, 'HostIdentity', 'HostIdentity', NOW(), NOW());

/* SQL text to insert entity field value with ID 4861f26c-88fe-4cb5-8870-28e8deec88d3 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('4861f26c-88fe-4cb5-8870-28e8deec88d3', '34794587-43D0-451C-9846-AEDA0DFCEE58', 3, 'MagicLinkUpgrade', 'MagicLinkUpgrade', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 34794587-43D0-451C-9846-AEDA0DFCEE58 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='34794587-43D0-451C-9846-AEDA0DFCEE58';

/* SQL text to insert entity field value with ID 6784dee2-6699-48d7-9a3b-eb9b36c9a935 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('6784dee2-6699-48d7-9a3b-eb9b36c9a935', 'CDAD88B3-02D2-48F7-BD2A-5DC15CE9EA37', 1, 'Active', 'Active', NOW(), NOW());

/* SQL text to insert entity field value with ID 306c9586-a69b-4c08-8d2a-4f95b4a0861f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('306c9586-a69b-4c08-8d2a-4f95b4a0861f', 'CDAD88B3-02D2-48F7-BD2A-5DC15CE9EA37', 2, 'Disabled', 'Disabled', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID CDAD88B3-02D2-48F7-BD2A-5DC15CE9EA37 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='CDAD88B3-02D2-48F7-BD2A-5DC15CE9EA37';


/* Create Entity Relationship: MJ: AI Agents -> MJ: Conversation Widget Instances (One To Many via PinnedAgentID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '425589ee-c89d-44da-bfae-8d1c0cae27e1'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('425589ee-c89d-44da-bfae-8d1c0cae27e1', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '88026538-D440-48F5-9FE8-A8A7198DBF83', 'PinnedAgentID', 'One To Many', TRUE, TRUE, 35, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd4e1c60f-7844-41a8-823b-8383bea33412'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('d4e1c60f-7844-41a8-823b-8383bea33412', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '88026538-D440-48F5-9FE8-A8A7198DBF83', 'GuestRoleID', 'One To Many', TRUE, TRUE, 15, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bf6a0485-8ac1-4204-b8b0-023723d7f5b6'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('bf6a0485-8ac1-4204-b8b0-023723d7f5b6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '17198778-E25A-4457-80AF-9E8C4961DC29', 'LinkedEntityID', 'One To Many', TRUE, TRUE, 69, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '288fa7a0-d0b5-45bb-b61a-8c64f78fec76'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('288fa7a0-d0b5-45bb-b61a-8c64f78fec76', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', '88026538-D440-48F5-9FE8-A8A7198DBF83', 'ApplicationID', 'One To Many', TRUE, TRUE, 10, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b90218d9-99e4-4d55-8f34-fd025e710c2d'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('b90218d9-99e4-4d55-8f34-fd025e710c2d', '13248F34-2837-EF11-86D4-6045BDEE16E6', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'LastConversationID', 'One To Many', TRUE, TRUE, 8, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '21269657-c023-4b86-b815-690ea6c1d1bc' OR ("EntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'LastConversation')
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
        '21269657-c023-4b86-b815-690ea6c1d1bc',
        '13248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Conversations"
        100069,
        'LastConversation',
        'Last Conversation',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1123af13-3974-4746-9895-373420418772' OR ("EntityID" = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RootLastConversationID')
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
        '1123af13-3974-4746-9895-373420418772',
        '13248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Conversations"
        100070,
        'RootLastConversationID',
        'Root Last Conversation ID',
        NULL,
        'UUID',
        16,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a216d3de-11c4-44be-86de-c7aa488a3189' OR ("EntityID" = '17198778-E25A-4457-80AF-9E8C4961DC29' AND "Name" = 'LinkedEntity')
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
        'a216d3de-11c4-44be-86de-c7aa488a3189',
        '17198778-E25A-4457-80AF-9E8C4961DC29', -- "Entity": "MJ": "AI" "Agent" "Sessions"
        100046,
        'LinkedEntity',
        'Linked Entity',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '15c08f1a-d26a-40cb-b051-5ed89c62f36f' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'Application')
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
        '15c08f1a-d26a-40cb-b051-5ed89c62f36f',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100039,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ec23fcee-9c2b-4757-81b1-d1dab59a9672' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'PinnedAgent')
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
        'ec23fcee-9c2b-4757-81b1-d1dab59a9672',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100040,
        'PinnedAgent',
        'Pinned Agent',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd2c1556e-9691-4917-8251-72ae39aebb20' OR ("EntityID" = '88026538-D440-48F5-9FE8-A8A7198DBF83' AND "Name" = 'GuestRole')
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
        'd2c1556e-9691-4917-8251-72ae39aebb20',
        '88026538-D440-48F5-9FE8-A8A7198DBF83', -- "Entity": "MJ": "Conversation" "Widget" "Instances"
        100041,
        'GuestRole',
        'Guest Role',
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

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([LinkedEntityID] IS NULL AND [LinkedRecordID] IS NULL OR [LinkedEntityID] IS NOT NULL AND [LinkedRecordID] IS NOT NULL)', 'public ValidateLinkedEntityAndRecordCoexistence(result: ValidationResult) {
	const hasEntity = this.LinkedEntityID != null;
	const hasRecord = this.LinkedRecordID != null && this.LinkedRecordID !== "";

	if (hasEntity !== hasRecord) {
		result.Errors.push(new ValidationErrorInfo(
			"LinkedEntityID",
			"Both Linked Entity ID and Linked Record ID must be provided together, or both must be left blank.",
			this.LinkedEntityID,
			ValidationErrorType.Failure
		));
	}
}', 'Both Linked Entity ID and Linked Record ID must either be provided together or both left empty. This ensures that a link to an external record is always complete with both its entity type and record identifier.', 'ValidateLinkedEntityAndRecordCoexistence', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '17198778-E25A-4457-80AF-9E8C4961DC29');

/* Generated Validation Functions for MJ: Conversation Widget Instances */
-- CHECK constraint for MJ: Conversation Widget Instances: Field: RateLimitPerMinute was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([RateLimitPerMinute]>(0))', 'public ValidateRateLimitPerMinuteGreaterThanZero(result: ValidationResult) {
	if (this.RateLimitPerMinute !== undefined && this.RateLimitPerMinute !== null && this.RateLimitPerMinute <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"RateLimitPerMinute",
			"The rate limit per minute must be greater than 0.",
			this.RateLimitPerMinute,
			ValidationErrorType.Failure
		));
	}
}', 'The rate limit per minute must be a positive number greater than zero to ensure the application can process requests.', 'ValidateRateLimitPerMinuteGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'FA99F64E-2902-4926-9EA4-1C8E45931EBC');

            -- CHECK constraint for MJ: Conversation Widget Instances: Field: SessionTTLMinutes was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function;

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([SessionTTLMinutes]>(0) AND [SessionTTLMinutes]<=(1440))', 'public ValidateSessionTTLMinutesRange(result: ValidationResult) {
	if (this.SessionTTLMinutes != null && (this.SessionTTLMinutes <= 0 || this.SessionTTLMinutes > 1440)) {
		result.Errors.push(new ValidationErrorInfo(
			"SessionTTLMinutes",
			"Session TTL must be greater than 0 and less than or equal to 1440 minutes (24 hours).",
			this.SessionTTLMinutes,
			ValidationErrorType.Failure
		));
	}
}', 'The session time-to-live (TTL) must be greater than 0 minutes and cannot exceed 1440 minutes (24 hours).', 'ValidateSessionTTLMinutesRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '54A96AFE-A5F0-4956-85F4-D02B5A4FD83F');

            -- CHECK constraint for MJ: Conversation Widget Instances: Field: VisitorMemoryRetentionDays was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function;

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([VisitorMemoryRetentionDays]>(0))', 'public ValidateVisitorMemoryRetentionDaysGreaterThanZero(result: ValidationResult) {
	if (this.VisitorMemoryRetentionDays != null && this.VisitorMemoryRetentionDays <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"VisitorMemoryRetentionDays",
			"Visitor memory retention days must be greater than 0.",
			this.VisitorMemoryRetentionDays,
			ValidationErrorType.Failure
		));
	}
}', 'The visitor memory retention period, if specified, must be a positive number of days greater than zero.', 'ValidateVisitorMemoryRetentionDaysGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8773C7A4-317A-4947-B9F5-346DC7CDABA5');


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: Permissions for vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spCreateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Notes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spUpdateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spDeleteAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNote
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Notes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for AIAgentSession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentSession;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentSessions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: Permissions for vwAIAgentSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentSessions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: spCreateAIAgentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentSession
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Sessions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: spUpdateAIAgentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentSession
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: spDeleteAIAgentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentSession
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Sessions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for ConversationWidgetInstance */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Widget Instances
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ApplicationID in table ConversationWidgetInstance;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationWidgetInstances" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Conversation Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Widget Instances
-- Item: Permissions for vwConversationWidgetInstances
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationWidgetInstances" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Conversation Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Widget Instances
-- Item: spCreateConversationWidgetInstance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationWidgetInstance
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationWidgetInstance" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Conversation Widget Instances */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationWidgetInstance" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Conversation Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Widget Instances
-- Item: spUpdateConversationWidgetInstance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationWidgetInstance
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationWidgetInstance" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationWidgetInstance" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Widget Instances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Widget Instances
-- Item: spDeleteConversationWidgetInstance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationWidgetInstance
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationWidgetInstance" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Widget Instances */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationWidgetInstance" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for Conversation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Conversation;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversations" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: Permissions for vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversations" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spCreateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Conversation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversation" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Conversations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversation" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spUpdateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Conversation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversation" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversation" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spDeleteConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Conversation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: spDeleteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Application
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplication" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Applications */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplication" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

-- Extended property (could not parse)
-- -- ============================================================================
-- -- Migration: Public Web Widget + Returning-Visitor Memory  (consolidated)
-- -- Part of the Agent Bridges & Public Widget program.
-- --   plans/realtime/bridges-and-widget/public-web-widget.md         (Widget Instances + Guest RLS)
-- --   plans/realtime/bridges-and-widget/returning-visitor-memory.md  (RV0 schema)
-- --   plans/realtime/bridges-and-widget/widget-schema-redesign.md    (pre-merge revision)
-- --
-- -- This is the SINGLE schema migration for the PR. It contains, in order:
-- --   1. "MJ: Conversation Widget Instances" table — durable per-deployment widget
-- --      config, INCLUDING the returning-visitor opt-in toggle + retention (R6).
-- --   2. Returning-visitor cross-session continuity columns on Conversation:
-- --      a durable visitor anchor (VisitorKey, R3) and a conversation-altitude chain
-- --      (LastConversationID, R2). The RESOLVED counterparty identity reuses the
-- --      existing polymorphic LinkedEntityID / LinkedRecordID pair (present from the
-- --      v5.38 baseline, CK_Conversation_LinkBinding) — NO second pair is added.
-- --   3. A polymorphic LinkedEntityID / LinkedRecordID pair on AIAgentSession, so a
-- --      realtime session can carry its counterparty identity directly (mirrors the
-- --      Conversation pair + its both-or-neither LinkBinding check).
-- --   4. Hand-authored non-FK lookup index for VisitorKey.
-- --   5. Widget Guest Row-Level-Security filter seed rows (reference data).
-- --   6. [appended below] CodeGen output for all of the above.
-- --
-- -- NOTE on memory scoping (plan R5, superseded): the agent-notes system already
-- --   carries a polymorphic note scope (MJ: AI Agent Notes . PrimaryScopeEntityID +
-- --   PrimaryScopeRecordID + SecondaryScopes), and the memory injector already filters
-- --   by it. Returning-visitor recaps reuse that existing scope (matching AN-BC's
-- --   "reuse the existing memory system, no parallel store" guidance), so this migration
-- --   adds NO columns to AIAgentNote — the polymorphic identity lives on Conversation /
-- --   AIAgentSession.
-- --
-- -- NOTE on naming (widget-schema-redesign): the entity is ConversationWidgetInstance
-- --   (not WidgetInstance) to follow MJ's domain-prefix convention (ConversationX,
-- --   AIAgentX). The conversation chain column is LastConversationID (not
-- --   PreviousConversationID) to mirror the existing AIAgentSession.LastSessionID name.
-- --
-- -- Conventions: no __mj_CreatedAt/__mj_UpdatedAt columns and no FK indexes are
-- --   declared here — CodeGen generates those (IDX_AUTO_MJ_FKEY_*). One ALTER TABLE
-- --   per table with comma-separated ADDs. sp_addextendedproperty for every new
-- --   column. Polymorphic *RecordID columns are VARCHAR(500), NOT FK-constrained
-- --   (they point at any entity's record, incl. composite/non-uuid PKs).
-- --   Seed config rows for Conversation Widget Instances go via mj-sync metadata (NOT
-- --   SQL INSERTs). The RLS filter rows ARE SQL-seeded because RowLevelSecurityFilter
-- --   create is denied to non-Owner principals (MetadataSync runs as System), identical
-- --   to the Magic Link RLS seeds; the EntityPermission -> filter LINK is done in
-- --   metadata (metadata/entity-permissions) via @lookup by Name.
-- -- ============================================================================
-- 
-- 
-- -- =============================================================================
-- -- 1. MJ: Conversation Widget Instances
-- -- =============================================================================
-- -- A Conversation Widget Instance is the durable, per-deployment configuration for
-- -- one embeddable public support widget — one row per site/embed that drops the
-- -- <script> tag. It resolves a public widget key (pk_live_…) to its application
-- -- scope, the PINNED support agent, the restricted GUEST ROLE, the allowed
-- -- embedding origins, the enabled modality + auth strategy, abuse ceilings, and
-- -- (R6) whether this deployment remembers returning visitors + for how long.

COMMENT ON TABLE __mj."ConversationWidgetInstance" IS 'Durable per-deployment configuration for one embeddable public support widget (text and/or voice). One row per site/embed. Resolves a public widget key to its application scope, pinned support agent, restricted guest role, allowed origins, modality, auth strategy, and abuse ceilings. Reuses the magic-link anonymous-embed minting path at session time; this entity holds only the configuration.';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."Name" IS 'Human-readable name for this widget deployment (e.g. "Acme Marketing Site Support").';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."PublicKey" IS 'Public, non-secret embed key (e.g. "pk_live_…") placed in the host page';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."ApplicationID" IS 'Foreign key to Application — the single app a guest session is scoped to. Mirrors the magic-link single-application model.';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."PinnedAgentID" IS 'Foreign key to AIAgent — the support agent that is PINNED for every turn (passed as explicitAgentId). D5: pinning fixes which agent runs; combined with the restricted guest role it prevents a public visitor from reaching arbitrary agents/data. The pinned agent';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."GuestRoleID" IS 'Foreign key to Role — the restricted guest role assigned to the synthesized guest principal. This role';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."AllowedOrigins" IS 'Allowed embedding origins for this widget, as a JSON array of origin strings (e.g. ["https://www.acme.com","https://acme.com"]). Enforced both at mint (POST /widget/session rejects unlisted Origin) and via CORS. NULL or empty means no origin is allowed (fail-closed).';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."Modality" IS 'Which modalities this widget exposes: Text (chat only), Voice (client-direct realtime only), or Both. Gates whether the realtime-mint path is offered to the guest.';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."AuthStrategy" IS 'Pluggable public-auth strategy (D1): Anonymous (guest-first, default), MagicLinkUpgrade (guest may escalate to an email-verified session), or HostIdentity (an authenticated host portal posts a signed identity assertion exchanged for an MJ guest JWT). All three converge on AuthProviderFactory + buildMagicLinkSessionUser.';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."Status" IS 'Lifecycle status. Active widgets mint sessions; Disabled widgets reject all mints (used to turn off a deployment without deleting its config).';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."SessionTTLMinutes" IS 'Time-to-live in minutes for a minted guest session JWT. Short by design (default 15) to limit replay/theft; the widget refreshes before expiry. Capped at 1440 (24h).';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."RateLimitPerMinute" IS 'Maximum number of guest-session mints allowed per minute per source IP/origin for this widget. Reuses the magic-link rate-limit pattern.';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."VoiceMaxSessionMinutes" IS 'Optional hard ceiling (minutes) on a single voice session';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."EnabledChannels" IS 'Which MJ interactive channels this widget may attach when a voice session is active, as a JSON array of channel names (e.g. ["Whiteboard"]). Resolved client-side through MJGlobal.ClassFactory the same way the realtime client driver is resolved; each named channel is scoped by the existing Widget Guest RLS on AI Agent Session Channels. NULL or empty array = no channels (the backwards-compatible default). Remote Browser, given its control surface, should only be listed when a deployment explicitly opts in.';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."HostPublicKey" IS 'PEM-encoded RS256 public key for the host-identity auth strategy (D1). When AuthStrategy is HostIdentity, the host signs a short-lived identity assertion with its private key; the HostIdentityProvider verifies it against this per-instance key. Supersedes the interim config map (mj.config.cjs hostPublicKeys keyed by PublicKey). NULL when the widget does not use host identity; a HostIdentity widget with no key fails closed at mint.';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."RememberReturningVisitors" IS 'Returning-visitor memory opt-in (R6). When 0 (default) this widget sets no durable visitor cookie and writes no cross-session recap — fully off. When 1, the widget mints a durable VisitorKey cookie, links each new Conversation to the visitor';

COMMENT ON COLUMN __mj."ConversationWidgetInstance"."VisitorMemoryRetentionDays" IS 'Retention window (days) for returning-visitor recap memory notes generated by this widget. NULL means use the system default. Past this window the visitor';

COMMENT ON COLUMN __mj."Conversation"."VisitorKey" IS 'Durable, opaque returning-visitor anchor (R3). Holds the value of a long-lived first-party cookie minted by the widget on first visit, used to find this visitor';

COMMENT ON COLUMN __mj."Conversation"."LastConversationID" IS 'Conversation-altitude returning-visitor chain (R2). Self-foreign-key to the visitor';

COMMENT ON COLUMN __mj."AIAgentSession"."LinkedEntityID" IS 'Polymorphic counterparty-identity entity. Foreign key to Entity — identifies WHICH entity this realtime session';

COMMENT ON COLUMN __mj."AIAgentSession"."LinkedRecordID" IS 'Polymorphic counterparty-identity record key. The primary-key value of the record (within LinkedEntityID';


-- ===================== Other =====================

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: AI Agent Notes */

/* spUpdate Permissions for MJ: AI Agent Sessions */

/* spUpdate Permissions for MJ: Conversation Widget Instances */

/* spUpdate Permissions for MJ: Conversations */
