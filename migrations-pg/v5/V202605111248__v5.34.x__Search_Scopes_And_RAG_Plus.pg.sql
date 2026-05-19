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

-- =====================================================================================================================
-- Migration: Search Scopes & RAG+ — multi-phase ship (consolidated)
-- Version: v5.32.x
-- =====================================================================================================================
-- This single file consolidates the schema work for the Search Scopes & RAG+ initiative
-- (Phases 1, 2A, 2D, 3, 4, plus a post-hoc unique-constraint tightening). Hand-authored DDL
-- comes first; CodeGen-emitted regenerations of entity metadata, views, sprocs, and
-- permission grants follow after the separator below.
--
-- Sections (DDL):
-- 1. Phase 1 baseline — `SearchScope`, `SearchScopeProvider`, `SearchScopeEntity`,
-- `SearchScopeStorage`, `SearchScopeExternalIndex`, `AIAgentSearchScope`, plus the
-- `AIAgent."SearchScopeAccess"` enum column ('None' | 'All' | 'Assigned').
--
-- 2. Phase 2A.2 — `SearchScopePermission` table. User XOR Role principal, PermissionLevel
-- CHECK ∈ ('None','Read','Search','Manage'). Backs the 6-step permission resolver.
--
-- 3. Phase 2D.6 — `SearchScope."RerankerBudgetCents"` column. Per-search reranker spend cap;
-- enforced by `RerankerBudgetGuard` in the engine.
--
-- 4. Phase 3.1 — `SearchExecutionLog` table. One row per `SearchEngine."Search"()` invocation
-- (Status / ResultCount / TotalDurationMs / RerankerCostCents / ProvidersJSON / AIAgentID).
--
-- 5. Phase 4.4 — `SearchScopeTestQuery` table. Saved test queries for the live-preview panel
-- on the SearchScope custom form.
--
-- 6. Post-hoc fix — `UQ_SearchScopePermission_User` and `UQ_SearchScopePermission_Role`
-- unique constraints. Prevents duplicate (Scope, User) and (Scope, Role) grants.
--
-- Sections (CodeGen):
-- 7-11. Five `CodeGen_Run_*.sql` outputs in commit order. These regenerate `EntityField`
-- rows, sprocs (`spCreate*`/`spUpdate*`/`spDelete*`), views, dropdown value lists,
-- and permission grants for everything Sections 1-6 changed.
--
-- Run order is chronological — DDL must precede the CodeGen output for that DDL because
-- CodeGen reads the new tables/columns and emits SPs that reference them.
--
-- Plan reference: RAG_plan.md Section 4.2 ("Expected migrations in commit order").
-- =====================================================================================================================


-- =====================================================================================================================
-- Section 1: Phase 1 baseline — Search Scope schema + AIAgent."SearchScopeAccess"
-- (Source: V202604182034__v5.28.x__Add_Search_Scopes_And_Agent_Integration.sql)
-- =====================================================================================================================

-- =============================================================================
-- Migration: Search Scopes & Agent Integration (RAG+)
-- Version: v5.28.x
-- Plan: plans/search-scopes-rag-plus.md
-- =============================================================================
-- Introduces configurable, permission-aware Search Scopes plus agent linkage
-- for pre-execution RAG and scoped tool-invoked search.
--
-- Tables created:
-- 1. SearchScope — Named, reusable search boundary
-- 2. SearchScopeProvider — Which providers participate in a scope
-- 3. SearchScopeExternalIndex — Scoped external indexes (vector + 3rd-party)
-- 4. SearchScopeEntity — Scoped entity search + per-entity overrides
-- 5. SearchScopeStorageAccount — Scoped storage accounts / folders
-- 6. AIAgentSearchScope — M:N agent ↔ scope with phase/time control
--
-- Column added to existing AIAgent table:
-- SearchScopeAccess — All | Assigned | None
--
-- Notes:
-- - No __mj_* timestamp columns, no FK indexes (CodeGen handles both)
-- - No seed data (Global SearchScope + Search Result Set ArtifactType go
-- through metadata sync, not migration)
-- - Extended properties follow at the bottom (MJ convention)
-- =============================================================================


-- =============================================================================
-- TABLE 1: SearchScope
-- =============================================================================
CREATE TABLE __mj."SearchScope" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "Icon" VARCHAR(200) NULL,
 "IsGlobal" BOOLEAN NOT NULL DEFAULT FALSE,
 "IsDefault" BOOLEAN NOT NULL DEFAULT FALSE,
 "OwnerUserID" UUID NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 "StartAt" TIMESTAMPTZ NULL,
 "EndAt" TIMESTAMPTZ NULL,
 "ScopeConfig" TEXT NULL,
 "SearchContextConfig" TEXT NULL,
 CONSTRAINT "PK_SearchScope" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_SearchScope_Name" UNIQUE ("Name"),
 CONSTRAINT "FK_SearchScope_OwnerUser" FOREIGN KEY ("OwnerUserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT "CK_SearchScope_Status" CHECK ("Status" IN ('Active', 'Inactive'))
);

-- =============================================================================
-- TABLE 2: SearchScopeProvider
-- =============================================================================
CREATE TABLE __mj."SearchScopeProvider" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SearchScopeID" UUID NOT NULL,
 "SearchProviderID" UUID NOT NULL,
 "Enabled" BOOLEAN NOT NULL DEFAULT TRUE,
 "MaxResultsOverride" INTEGER NULL,
 "ProviderConfigOverride" TEXT NULL,
 "QueryTransformTemplateID" UUID NULL,
 CONSTRAINT "PK_SearchScopeProvider" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_SearchScopeProvider_Scope" FOREIGN KEY ("SearchScopeID")
 REFERENCES __mj."SearchScope"("ID"),
 CONSTRAINT "FK_SearchScopeProvider_Provider" FOREIGN KEY ("SearchProviderID")
 REFERENCES __mj."SearchProvider"("ID"),
 CONSTRAINT "FK_SearchScopeProvider_QueryTransformTemplate" FOREIGN KEY ("QueryTransformTemplateID")
 REFERENCES __mj."Template"("ID"),
 CONSTRAINT "UQ_SearchScopeProvider" UNIQUE ("SearchScopeID", "SearchProviderID")
);

-- =============================================================================
-- TABLE 3: SearchScopeExternalIndex
-- =============================================================================
-- Scoped external/provider-owned indexes. Generic: covers vector stores
-- (Pinecone, Qdrant, PGVector) AND text/hybrid engines (Elasticsearch,
-- Typesense, Azure AI Search, OpenSearch). A single scope can mix types.
-- =============================================================================
CREATE TABLE __mj."SearchScopeExternalIndex" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SearchScopeID" UUID NOT NULL,
 "IndexType" VARCHAR(40) NOT NULL DEFAULT 'Vector',
 "VectorIndexID" UUID NULL,
 "ExternalIndexName" VARCHAR(400) NULL,
 "ExternalIndexConfig" TEXT NULL,
 "MetadataFilter" TEXT NULL,
 CONSTRAINT "PK_SearchScopeExternalIndex" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_SearchScopeExternalIndex_Scope" FOREIGN KEY ("SearchScopeID")
 REFERENCES __mj."SearchScope"("ID"),
 CONSTRAINT "FK_SearchScopeExternalIndex_VectorIndex" FOREIGN KEY ("VectorIndexID")
 REFERENCES __mj."VectorIndex"("ID"),
 CONSTRAINT "CK_SearchScopeExternalIndex_IndexType"
 CHECK ("IndexType" IN ('Vector','Elasticsearch','Typesense','AzureAISearch','OpenSearch','Other')),
 CONSTRAINT "CK_SearchScopeExternalIndex_Identifier"
 CHECK (("IndexType" = 'Vector' AND "VectorIndexID" IS NOT NULL)
 OR ("IndexType" <> 'Vector' AND "ExternalIndexName" IS NOT NULL))
);

-- =============================================================================
-- TABLE 4: SearchScopeEntity
-- =============================================================================
CREATE TABLE __mj."SearchScopeEntity" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SearchScopeID" UUID NOT NULL,
 "EntityID" UUID NOT NULL,
 "ExtraFilter" TEXT NULL,
 "UserSearchString" TEXT NULL,
 CONSTRAINT "PK_SearchScopeEntity" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_SearchScopeEntity_Scope" FOREIGN KEY ("SearchScopeID")
 REFERENCES __mj."SearchScope"("ID"),
 CONSTRAINT "FK_SearchScopeEntity_Entity" FOREIGN KEY ("EntityID")
 REFERENCES __mj."Entity"("ID"),
 CONSTRAINT "UQ_SearchScopeEntity" UNIQUE ("SearchScopeID", "EntityID")
);

-- =============================================================================
-- TABLE 5: SearchScopeStorageAccount
-- =============================================================================
CREATE TABLE __mj."SearchScopeStorageAccount" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SearchScopeID" UUID NOT NULL,
 "FileStorageAccountID" UUID NOT NULL,
 "FolderPath" VARCHAR(1000) NULL,
 CONSTRAINT "PK_SearchScopeStorageAccount" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_SearchScopeStorageAccount_Scope" FOREIGN KEY ("SearchScopeID")
 REFERENCES __mj."SearchScope"("ID"),
 CONSTRAINT "FK_SearchScopeStorageAccount_Account" FOREIGN KEY ("FileStorageAccountID")
 REFERENCES __mj."FileStorageAccount"("ID")
);

-- =============================================================================
-- TABLE 6: AIAgentSearchScope
-- =============================================================================
CREATE TABLE __mj."AIAgentSearchScope" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "AgentID" UUID NOT NULL,
 "SearchScopeID" UUID NOT NULL,
 "Phase" VARCHAR(20) NOT NULL DEFAULT 'Both',
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 "StartAt" TIMESTAMPTZ NULL,
 "EndAt" TIMESTAMPTZ NULL,
 "Priority" INTEGER NOT NULL DEFAULT 100,
 "MaxResults" INTEGER NULL,
 "MinScore" DECIMAL(5,4) NULL,
 "QueryTemplateID" UUID NULL,
 "FusionWeightsOverride" TEXT NULL,
 "IsDefault" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT "PK_AIAgentSearchScope" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_AIAgentSearchScope_Agent" FOREIGN KEY ("AgentID")
 REFERENCES __mj."AIAgent"("ID"),
 CONSTRAINT "FK_AIAgentSearchScope_Scope" FOREIGN KEY ("SearchScopeID")
 REFERENCES __mj."SearchScope"("ID"),
 CONSTRAINT "FK_AIAgentSearchScope_QueryTemplate" FOREIGN KEY ("QueryTemplateID")
 REFERENCES __mj."Template"("ID"),
 CONSTRAINT "CK_AIAgentSearchScope_Phase"
 CHECK ("Phase" IN ('PreExecution', 'AgentInvoked', 'Both')),
 CONSTRAINT "CK_AIAgentSearchScope_Status"
 CHECK ("Status" IN ('Active', 'Inactive'))
);

-- =============================================================================
-- ALTER AIAgent: add SearchScopeAccess column
-- =============================================================================
ALTER TABLE __mj."AIAgent"
 ADD COLUMN IF NOT EXISTS "SearchScopeAccess" VARCHAR(20) NOT NULL
        CONSTRAINT DF_AIAgent_SearchScopeAccess DEFAULT 'None'
        CONSTRAINT CK_AIAgent_SearchScopeAccess CHECK ("SearchScopeAccess" IN ('All', 'Assigned', 'None'));

-- =====================================================================================================================
-- Section 2: Phase 2A.2 — SearchScopePermission table
-- (Source: V202604280730__v5.30.x__Add_SearchScopePermission.sql)
-- =====================================================================================================================

-- =============================================================================
-- Migration: Search Scope Permission (RAG+ Phase 2A)
-- Version: v5.30.x
-- Plan: RAG_plan.md §3 Phase 2A.2, plans/search-scopes-rag-plus.md
-- =============================================================================
-- Per-user / per-role permission grant on a SearchScope. Each row authorizes
-- exactly one principal (User OR Role, not both) at one of four levels.
-- Permission resolution combines this table with AIAgent."SearchScopeAccess" for
-- agent-side fallbacks. See SearchScopePermissionResolver in
-- packages/SearchEngine/src/permissions/.
--
-- Notes:
-- - No __mj_* timestamp columns, no FK indexes (CodeGen handles both)
-- - No seed data (admins author rows through the SearchScope/AIAgent forms)
-- - Extended properties follow at the bottom (MJ convention)
-- =============================================================================


-- =============================================================================
-- TABLE: SearchScopePermission
-- =============================================================================
CREATE TABLE __mj."SearchScopePermission" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SearchScopeID" UUID NOT NULL,
 "UserID" UUID NULL,
 "RoleID" UUID NULL,
 "PermissionLevel" VARCHAR(20) NOT NULL,
 CONSTRAINT "PK_SearchScopePermission" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_SearchScopePermission_SearchScope" FOREIGN KEY ("SearchScopeID")
 REFERENCES __mj."SearchScope"("ID"),
 CONSTRAINT "FK_SearchScopePermission_User" FOREIGN KEY ("UserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT "FK_SearchScopePermission_Role" FOREIGN KEY ("RoleID")
 REFERENCES __mj."Role"("ID"),
 CONSTRAINT "CK_SearchScopePermission_Level"
 CHECK ("PermissionLevel" IN ('None', 'Read', 'Search', 'Manage')),
 CONSTRAINT "CK_SearchScopePermission_Principal"
 CHECK (("UserID" IS NOT NULL AND "RoleID" IS NULL)
 OR ("UserID" IS NULL AND "RoleID" IS NOT NULL)),
 CONSTRAINT "UQ_SearchScopePermission_User"
 UNIQUE ("SearchScopeID", "UserID"),
 CONSTRAINT "UQ_SearchScopePermission_Role"
 UNIQUE ("SearchScopeID", "RoleID")
);

ALTER TABLE __mj."SearchScope"
 ADD COLUMN IF NOT EXISTS "RerankerBudgetCents" INTEGER NULL;

-- =====================================================================================================================
-- Section 4: Phase 3.1 — SearchExecutionLog
-- (Source: V202604281130__v5.30.x__Add_SearchExecutionLog.sql)
-- =====================================================================================================================

-- =============================================================================
-- Migration: SearchExecutionLog (RAG+ Phase 3.1)
-- Version: v5.30.x
-- Plan: RAG_plan.md §3 Phase 3.1, ~/.claude/plans/make-a-plan-for-buzzing-sky.md
-- =============================================================================
-- One row per search invocation against the SearchEngine. Captures everything
-- the analytics dashboard (Phase 3.3) and per-scope CSV export (Phase 3.4)
-- need to reconstruct usage patterns: scope + user + agent identity, query
-- text, timing, result count, reranker info + cost, status, and per-provider
-- duration / count breakdown in a JSON blob.
--
-- Notes:
-- - Query is TEXT — some queries are long (full sentences, snippets)
-- - All FKs nullable because some invocations come from anonymized callers
-- and not every search uses a reranker / scope / agent identity
-- - ProvidersJSON is TEXT holding an array of {Provider, DurationMs,
-- ResultCount, ErrorMessage}
-- - No __mj_* timestamp columns, no manual FK indexes (CodeGen handles)
-- - No seed data
-- =============================================================================

CREATE TABLE __mj."SearchExecutionLog" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SearchScopeID" UUID NULL,
 "UserID" UUID NULL,
 "AIAgentID" UUID NULL,
 "Query" TEXT NOT NULL,
 "TotalDurationMs" INTEGER NOT NULL,
 "ResultCount" INTEGER NOT NULL DEFAULT 0,
 "RerankerName" VARCHAR(100) NULL,
 "RerankerCostCents" DECIMAL(10, 4) NULL,
 "Status" VARCHAR(20) NOT NULL,
 "FailureReason" VARCHAR(500) NULL,
 "ProvidersJSON" TEXT NULL,
 CONSTRAINT "PK_SearchExecutionLog" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_SearchExecutionLog_SearchScope" FOREIGN KEY ("SearchScopeID")
 REFERENCES __mj."SearchScope"("ID"),
 CONSTRAINT "FK_SearchExecutionLog_User" FOREIGN KEY ("UserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT "FK_SearchExecutionLog_AIAgent" FOREIGN KEY ("AIAgentID")
 REFERENCES __mj."AIAgent"("ID"),
 CONSTRAINT "CK_SearchExecutionLog_Status"
 CHECK ("Status" IN ('Success', 'Failure', 'Forbidden'))
);

-- =====================================================================================================================
-- Section 5: Phase 4.4 — SearchScopeTestQuery
-- (Source: V202604281200__v5.30.x__Add_SearchScopeTestQuery.sql)
-- =====================================================================================================================

-- =============================================================================
-- Migration: SearchScopeTestQuery (RAG+ Phase 4.4)
-- Version: v5.30.x
-- Plan: RAG_plan.md §3 Phase 4.4, ~/.claude/plans/make-a-plan-for-buzzing-sky.md
-- =============================================================================
-- Per-scope canonical test queries for offline tuning. Lets a scope author
-- save a small set of representative queries and re-run them after a config
-- change (reranker swap, weight adjustment, scope-template edit) to compare
-- before/after.
--
-- Notes:
-- - No __mj_* timestamp columns, no manual FK indexes (CodeGen owns)
-- - No seed data (admins author rows through the SearchScope form)
-- =============================================================================

CREATE TABLE __mj."SearchScopeTestQuery" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SearchScopeID" UUID NOT NULL,
 "Label" VARCHAR(200) NOT NULL,
 "Query" TEXT NOT NULL,
 "ExpectedTopResultEntity" VARCHAR(255) NULL,
 "ExpectedTopResultRecordID" UUID NULL,
 "Notes" TEXT NULL,
 CONSTRAINT "PK_SearchScopeTestQuery" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_SearchScopeTestQuery_SearchScope" FOREIGN KEY ("SearchScopeID")
 REFERENCES __mj."SearchScope"("ID")
);

ALTER TABLE __mj."SearchScopePermission"
    DROP CONSTRAINT "UQ_SearchScopePermission_User";

ALTER TABLE __mj."SearchScopePermission"
    DROP CONSTRAINT "UQ_SearchScopePermission_Role";

CREATE UNIQUE INDEX IF NOT EXISTS UQ_SearchScopePermission_User
    ON __mj."SearchScopePermission" ("SearchScopeID", "UserID")
    WHERE "UserID" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS UQ_SearchScopePermission_Role
    ON __mj."SearchScopePermission" ("SearchScopeID", "RoleID")
    WHERE "RoleID" IS NOT NULL;


-- =====================================================================================================================
-- =====================================================================================================================
-- =====================================================================================================================
--
--                     "END" "OF" "HAND"-"AUTHORED" "DDL"
--
--          "Below": "CodeGen"-generated regenerations of entity metadata, views, sprocs,
--                  and permission grants for the schema changes above.
--
-- =====================================================================================================================
-- =====================================================================================================================
-- =====================================================================================================================

 


-- "CODE" "GEN" "RUN"
/* "SQL" generated to create new entity "MJ": "Search" "Scopes" */

ALTER TABLE __mj."SearchScopeStorageAccount"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeStorageAccount" */
ALTER TABLE __mj."SearchScopeStorageAccount"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchExecutionLog" */
ALTER TABLE __mj."SearchExecutionLog"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchExecutionLog" */
ALTER TABLE __mj."SearchExecutionLog"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeProvider" */
ALTER TABLE __mj."SearchScopeProvider"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeProvider" */
ALTER TABLE __mj."SearchScopeProvider"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScope" */
ALTER TABLE __mj."SearchScope"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScope" */
ALTER TABLE __mj."SearchScope"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeEntity" */
ALTER TABLE __mj."SearchScopeEntity"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeEntity" */
ALTER TABLE __mj."SearchScopeEntity"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIAgentSearchScope" */
ALTER TABLE __mj."AIAgentSearchScope"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIAgentSearchScope" */
ALTER TABLE __mj."AIAgentSearchScope"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeTestQuery" */
ALTER TABLE __mj."SearchScopeTestQuery"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeTestQuery" */
ALTER TABLE __mj."SearchScopeTestQuery"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopePermission" */
ALTER TABLE __mj."SearchScopePermission"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopePermission" */
ALTER TABLE __mj."SearchScopePermission"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeExternalIndex" */
ALTER TABLE __mj."SearchScopeExternalIndex"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeExternalIndex" */
ALTER TABLE __mj."SearchScopeExternalIndex"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentSearchScope_AgentID" ON __mj."AIAgentSearchScope" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentSearchScope_SearchScopeID" ON __mj."AIAgentSearchScope" ("SearchScopeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentSearchScope_QueryTemplateID" ON __mj."AIAgentSearchScope" ("QueryTemplateID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchExecutionLog_SearchScopeID" ON __mj."SearchExecutionLog" ("SearchScopeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchExecutionLog_UserID" ON __mj."SearchExecutionLog" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchExecutionLog_AIAgentID" ON __mj."SearchExecutionLog" ("AIAgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopeEntity_SearchScopeID" ON __mj."SearchScopeEntity" ("SearchScopeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopeEntity_EntityID" ON __mj."SearchScopeEntity" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopeExternalIndex_SearchScopeID" ON __mj."SearchScopeExternalIndex" ("SearchScopeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopeExternalIndex_VectorIndexID" ON __mj."SearchScopeExternalIndex" ("VectorIndexID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopePermission_SearchScopeID" ON __mj."SearchScopePermission" ("SearchScopeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopePermission_UserID" ON __mj."SearchScopePermission" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopePermission_RoleID" ON __mj."SearchScopePermission" ("RoleID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopeProvider_SearchScopeID" ON __mj."SearchScopeProvider" ("SearchScopeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopeProvider_SearchProviderID" ON __mj."SearchScopeProvider" ("SearchProviderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopeProvider_QueryTransformTemplateID" ON __mj."SearchScopeProvider" ("QueryTransformTemplateID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopeStorageAccount_SearchScopeID" ON __mj."SearchScopeStorageAccount" ("SearchScopeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopeStorageAccount_FileStorageAccountID" ON __mj."SearchScopeStorageAccount" ("FileStorageAccountID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScopeTestQuery_SearchScopeID" ON __mj."SearchScopeTestQuery" ("SearchScopeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SearchScope_OwnerUserID" ON __mj."SearchScope" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ParentID" ON __mj."AIAgent" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID" ON __mj."AIAgent" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_TypeID" ON __mj."AIAgent" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID" ON __mj."AIAgent" ("DefaultArtifactTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID" ON __mj."AIAgent" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID" ON __mj."AIAgent" ("AttachmentStorageProviderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_CategoryID" ON __mj."AIAgent" ("CategoryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultStorageAccountID" ON __mj."AIAgent" ("DefaultStorageAccountID");


-- ===================== Helper Functions (fn*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'fnAIAgentParentID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnAIAgentParentID_GetRootID"(
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
            __mj."AIAgent"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgent" c
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
  v_target_name CONSTANT TEXT := 'vwAIAgentSearchScopes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentSearchScopes"
AS SELECT
    a.*,
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJSearchScope_SearchScopeID"."Name" AS "SearchScope",
    "MJTemplate_QueryTemplateID"."Name" AS "QueryTemplate"
FROM
    __mj."AIAgentSearchScope" AS a
INNER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    a."AgentID" = "MJAIAgent_AgentID"."ID"
INNER JOIN
    __mj."SearchScope" AS "MJSearchScope_SearchScopeID"
  ON
    a."SearchScopeID" = "MJSearchScope_SearchScopeID"."ID"
LEFT OUTER JOIN
    __mj."Template" AS "MJTemplate_QueryTemplateID"
  ON
    a."QueryTemplateID" = "MJTemplate_QueryTemplateID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSearchExecutionLogs';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSearchExecutionLogs"
AS SELECT
    s.*,
    "MJSearchScope_SearchScopeID"."Name" AS "SearchScope",
    "MJUser_UserID"."Name" AS "User",
    "MJAIAgent_AIAgentID"."Name" AS "AIAgent"
FROM
    __mj."SearchExecutionLog" AS s
LEFT OUTER JOIN
    __mj."SearchScope" AS "MJSearchScope_SearchScopeID"
  ON
    s."SearchScopeID" = "MJSearchScope_SearchScopeID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    s."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_AIAgentID"
  ON
    s."AIAgentID" = "MJAIAgent_AIAgentID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSearchScopeExternalIndexes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSearchScopeExternalIndexes"
AS SELECT
    s.*,
    "MJSearchScope_SearchScopeID"."Name" AS "SearchScope",
    "MJVectorIndex_VectorIndexID"."Name" AS "VectorIndex"
FROM
    __mj."SearchScopeExternalIndex" AS s
INNER JOIN
    __mj."SearchScope" AS "MJSearchScope_SearchScopeID"
  ON
    s."SearchScopeID" = "MJSearchScope_SearchScopeID"."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS "MJVectorIndex_VectorIndexID"
  ON
    s."VectorIndexID" = "MJVectorIndex_VectorIndexID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSearchScopeEntities';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSearchScopeEntities"
AS SELECT
    s.*,
    "MJSearchScope_SearchScopeID"."Name" AS "SearchScope",
    "MJEntity_EntityID"."Name" AS "Entity"
FROM
    __mj."SearchScopeEntity" AS s
INNER JOIN
    __mj."SearchScope" AS "MJSearchScope_SearchScopeID"
  ON
    s."SearchScopeID" = "MJSearchScope_SearchScopeID"."ID"
INNER JOIN
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
  v_target_name CONSTANT TEXT := 'vwSearchScopeProviders';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSearchScopeProviders"
AS SELECT
    s.*,
    "MJSearchScope_SearchScopeID"."Name" AS "SearchScope",
    "MJSearchProvider_SearchProviderID"."Name" AS "SearchProvider",
    "MJTemplate_QueryTransformTemplateID"."Name" AS "QueryTransformTemplate"
FROM
    __mj."SearchScopeProvider" AS s
INNER JOIN
    __mj."SearchScope" AS "MJSearchScope_SearchScopeID"
  ON
    s."SearchScopeID" = "MJSearchScope_SearchScopeID"."ID"
INNER JOIN
    __mj."SearchProvider" AS "MJSearchProvider_SearchProviderID"
  ON
    s."SearchProviderID" = "MJSearchProvider_SearchProviderID"."ID"
LEFT OUTER JOIN
    __mj."Template" AS "MJTemplate_QueryTransformTemplateID"
  ON
    s."QueryTransformTemplateID" = "MJTemplate_QueryTransformTemplateID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSearchScopePermissions';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSearchScopePermissions"
AS SELECT
    s.*,
    "MJSearchScope_SearchScopeID"."Name" AS "SearchScope",
    "MJUser_UserID"."Name" AS "User",
    "MJRole_RoleID"."Name" AS "Role"
FROM
    __mj."SearchScopePermission" AS s
INNER JOIN
    __mj."SearchScope" AS "MJSearchScope_SearchScopeID"
  ON
    s."SearchScopeID" = "MJSearchScope_SearchScopeID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    s."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."Role" AS "MJRole_RoleID"
  ON
    s."RoleID" = "MJRole_RoleID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSearchScopes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSearchScopes"
AS SELECT
    s.*,
    "MJUser_OwnerUserID"."Name" AS "OwnerUser"
FROM
    __mj."SearchScope" AS s
LEFT OUTER JOIN
    __mj."User" AS "MJUser_OwnerUserID"
  ON
    s."OwnerUserID" = "MJUser_OwnerUserID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSearchScopeTestQueries';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSearchScopeTestQueries"
AS SELECT
    s.*,
    "MJSearchScope_SearchScopeID"."Name" AS "SearchScope"
FROM
    __mj."SearchScopeTestQuery" AS s
INNER JOIN
    __mj."SearchScope" AS "MJSearchScope_SearchScopeID"
  ON
    s."SearchScopeID" = "MJSearchScope_SearchScopeID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwSearchScopeStorageAccounts';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSearchScopeStorageAccounts"
AS SELECT
    s.*,
    "MJSearchScope_SearchScopeID"."Name" AS "SearchScope",
    "MJFileStorageAccount_FileStorageAccountID"."Name" AS "FileStorageAccount"
FROM
    __mj."SearchScopeStorageAccount" AS s
INNER JOIN
    __mj."SearchScope" AS "MJSearchScope_SearchScopeID"
  ON
    s."SearchScopeID" = "MJSearchScope_SearchScopeID"."ID"
INNER JOIN
    __mj."FileStorageAccount" AS "MJFileStorageAccount_FileStorageAccountID"
  ON
    s."FileStorageAccountID" = "MJFileStorageAccount_FileStorageAccountID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIAgents';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgents"
AS SELECT
    a.*,
    "MJAIAgent_ParentID"."Name" AS "Parent",
    "MJAIPrompt_ContextCompressionPromptID"."Name" AS "ContextCompressionPrompt",
    "MJAIAgentType_TypeID"."Name" AS "Type",
    "MJArtifactType_DefaultArtifactTypeID"."Name" AS "DefaultArtifactType",
    "MJUser_OwnerUserID"."Name" AS "OwnerUser",
    "MJFileStorageProvider_AttachmentStorageProviderID"."Name" AS "AttachmentStorageProvider",
    "MJAIAgentCategory_CategoryID"."Name" AS "Category",
    "MJFileStorageAccount_DefaultStorageAccountID"."Name" AS "DefaultStorageAccount",
    "root_ParentID"."RootID" AS "RootParentID"
FROM
    __mj."AIAgent" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_ParentID"
  ON
    a."ParentID" = "MJAIAgent_ParentID"."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_ContextCompressionPromptID"
  ON
    a."ContextCompressionPromptID" = "MJAIPrompt_ContextCompressionPromptID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentType" AS "MJAIAgentType_TypeID"
  ON
    a."TypeID" = "MJAIAgentType_TypeID"."ID"
LEFT OUTER JOIN
    __mj."ArtifactType" AS "MJArtifactType_DefaultArtifactTypeID"
  ON
    a."DefaultArtifactTypeID" = "MJArtifactType_DefaultArtifactTypeID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_OwnerUserID"
  ON
    a."OwnerUserID" = "MJUser_OwnerUserID"."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS "MJFileStorageProvider_AttachmentStorageProviderID"
  ON
    a."AttachmentStorageProviderID" = "MJFileStorageProvider_AttachmentStorageProviderID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentCategory" AS "MJAIAgentCategory_CategoryID"
  ON
    a."CategoryID" = "MJAIAgentCategory_CategoryID"."ID"
LEFT OUTER JOIN
    __mj."FileStorageAccount" AS "MJFileStorageAccount_DefaultStorageAccountID"
  ON
    a."DefaultStorageAccountID" = "MJFileStorageAccount_DefaultStorageAccountID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIAgentParentID_GetRootID"(a."ID", a."ParentID")) AS "root_ParentID"
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
           WHERE proname = 'spCreateAIAgentSearchScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentSearchScope"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_Phase VARCHAR(20) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_StartAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_MaxResults_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxResults INTEGER DEFAULT NULL,
    IN p_MinScore_Clear BOOLEAN DEFAULT FALSE,
    IN p_MinScore NUMERIC(5,4) DEFAULT NULL,
    IN p_QueryTemplateID_Clear BOOLEAN DEFAULT FALSE,
    IN p_QueryTemplateID UUID DEFAULT NULL,
    IN p_FusionWeightsOverride_Clear BOOLEAN DEFAULT FALSE,
    IN p_FusionWeightsOverride TEXT DEFAULT NULL,
    IN p_IsDefault BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentSearchScopes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentSearchScope"
            (
                "ID",
                "AgentID",
                "SearchScopeID",
                "Phase",
                "Status",
                "StartAt",
                "EndAt",
                "Priority",
                "MaxResults",
                "MinScore",
                "QueryTemplateID",
                "FusionWeightsOverride",
                "IsDefault"
            )
        VALUES
            (
                p_ID,
                p_AgentID,
                p_SearchScopeID,
                COALESCE(p_Phase, 'Both'),
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, NULL) END,
                CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, NULL) END,
                COALESCE(p_Priority, 100),
                CASE WHEN p_MaxResults_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxResults, NULL) END,
                CASE WHEN p_MinScore_Clear = TRUE THEN NULL ELSE COALESCE(p_MinScore, NULL) END,
                CASE WHEN p_QueryTemplateID_Clear = TRUE THEN NULL ELSE COALESCE(p_QueryTemplateID, NULL) END,
                CASE WHEN p_FusionWeightsOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_FusionWeightsOverride, NULL) END,
                COALESCE(p_IsDefault, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentSearchScope"
            (
                "AgentID",
                "SearchScopeID",
                "Phase",
                "Status",
                "StartAt",
                "EndAt",
                "Priority",
                "MaxResults",
                "MinScore",
                "QueryTemplateID",
                "FusionWeightsOverride",
                "IsDefault"
            )
        VALUES
            (
                p_AgentID,
                p_SearchScopeID,
                COALESCE(p_Phase, 'Both'),
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, NULL) END,
                CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, NULL) END,
                COALESCE(p_Priority, 100),
                CASE WHEN p_MaxResults_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxResults, NULL) END,
                CASE WHEN p_MinScore_Clear = TRUE THEN NULL ELSE COALESCE(p_MinScore, NULL) END,
                CASE WHEN p_QueryTemplateID_Clear = TRUE THEN NULL ELSE COALESCE(p_QueryTemplateID, NULL) END,
                CASE WHEN p_FusionWeightsOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_FusionWeightsOverride, NULL) END,
                COALESCE(p_IsDefault, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentSearchScopes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgentSearchScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentSearchScope"(
    IN p_ID UUID,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_Phase VARCHAR(20) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_StartAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_MaxResults_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxResults INTEGER DEFAULT NULL,
    IN p_MinScore_Clear BOOLEAN DEFAULT FALSE,
    IN p_MinScore NUMERIC(5,4) DEFAULT NULL,
    IN p_QueryTemplateID_Clear BOOLEAN DEFAULT FALSE,
    IN p_QueryTemplateID UUID DEFAULT NULL,
    IN p_FusionWeightsOverride_Clear BOOLEAN DEFAULT FALSE,
    IN p_FusionWeightsOverride TEXT DEFAULT NULL,
    IN p_IsDefault BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentSearchScopes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentSearchScope"
    SET
        "AgentID" = COALESCE(p_AgentID, "AgentID"),
        "SearchScopeID" = COALESCE(p_SearchScopeID, "SearchScopeID"),
        "Phase" = COALESCE(p_Phase, "Phase"),
        "Status" = COALESCE(p_Status, "Status"),
        "StartAt" = CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, "StartAt") END,
        "EndAt" = CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, "EndAt") END,
        "Priority" = COALESCE(p_Priority, "Priority"),
        "MaxResults" = CASE WHEN p_MaxResults_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxResults, "MaxResults") END,
        "MinScore" = CASE WHEN p_MinScore_Clear = TRUE THEN NULL ELSE COALESCE(p_MinScore, "MinScore") END,
        "QueryTemplateID" = CASE WHEN p_QueryTemplateID_Clear = TRUE THEN NULL ELSE COALESCE(p_QueryTemplateID, "QueryTemplateID") END,
        "FusionWeightsOverride" = CASE WHEN p_FusionWeightsOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_FusionWeightsOverride, "FusionWeightsOverride") END,
        "IsDefault" = COALESCE(p_IsDefault, "IsDefault")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentSearchScopes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentSearchScopes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentSearchScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentSearchScope"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentSearchScope"
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
           WHERE proname = 'spCreateSearchExecutionLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSearchExecutionLog"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SearchScopeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_AIAgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AIAgentID UUID DEFAULT NULL,
    IN p_Query TEXT DEFAULT NULL,
    IN p_TotalDurationMs INTEGER DEFAULT NULL,
    IN p_ResultCount INTEGER DEFAULT NULL,
    IN p_RerankerName_Clear BOOLEAN DEFAULT FALSE,
    IN p_RerankerName VARCHAR(100) DEFAULT NULL,
    IN p_RerankerCostCents_Clear BOOLEAN DEFAULT FALSE,
    IN p_RerankerCostCents NUMERIC(10,4) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_FailureReason_Clear BOOLEAN DEFAULT FALSE,
    IN p_FailureReason VARCHAR(500) DEFAULT NULL,
    IN p_ProvidersJSON_Clear BOOLEAN DEFAULT FALSE,
    IN p_ProvidersJSON TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchExecutionLogs" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SearchExecutionLog"
            (
                "ID",
                "SearchScopeID",
                "UserID",
                "AIAgentID",
                "Query",
                "TotalDurationMs",
                "ResultCount",
                "RerankerName",
                "RerankerCostCents",
                "Status",
                "FailureReason",
                "ProvidersJSON"
            )
        VALUES
            (
                p_ID,
                CASE WHEN p_SearchScopeID_Clear = TRUE THEN NULL ELSE COALESCE(p_SearchScopeID, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_AIAgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AIAgentID, NULL) END,
                p_Query,
                p_TotalDurationMs,
                COALESCE(p_ResultCount, 0),
                CASE WHEN p_RerankerName_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerName, NULL) END,
                CASE WHEN p_RerankerCostCents_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerCostCents, NULL) END,
                p_Status,
                CASE WHEN p_FailureReason_Clear = TRUE THEN NULL ELSE COALESCE(p_FailureReason, NULL) END,
                CASE WHEN p_ProvidersJSON_Clear = TRUE THEN NULL ELSE COALESCE(p_ProvidersJSON, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SearchExecutionLog"
            (
                "SearchScopeID",
                "UserID",
                "AIAgentID",
                "Query",
                "TotalDurationMs",
                "ResultCount",
                "RerankerName",
                "RerankerCostCents",
                "Status",
                "FailureReason",
                "ProvidersJSON"
            )
        VALUES
            (
                CASE WHEN p_SearchScopeID_Clear = TRUE THEN NULL ELSE COALESCE(p_SearchScopeID, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_AIAgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AIAgentID, NULL) END,
                p_Query,
                p_TotalDurationMs,
                COALESCE(p_ResultCount, 0),
                CASE WHEN p_RerankerName_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerName, NULL) END,
                CASE WHEN p_RerankerCostCents_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerCostCents, NULL) END,
                p_Status,
                CASE WHEN p_FailureReason_Clear = TRUE THEN NULL ELSE COALESCE(p_FailureReason, NULL) END,
                CASE WHEN p_ProvidersJSON_Clear = TRUE THEN NULL ELSE COALESCE(p_ProvidersJSON, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSearchExecutionLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSearchExecutionLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSearchExecutionLog"(
    IN p_ID UUID,
    IN p_SearchScopeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_AIAgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AIAgentID UUID DEFAULT NULL,
    IN p_Query TEXT DEFAULT NULL,
    IN p_TotalDurationMs INTEGER DEFAULT NULL,
    IN p_ResultCount INTEGER DEFAULT NULL,
    IN p_RerankerName_Clear BOOLEAN DEFAULT FALSE,
    IN p_RerankerName VARCHAR(100) DEFAULT NULL,
    IN p_RerankerCostCents_Clear BOOLEAN DEFAULT FALSE,
    IN p_RerankerCostCents NUMERIC(10,4) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_FailureReason_Clear BOOLEAN DEFAULT FALSE,
    IN p_FailureReason VARCHAR(500) DEFAULT NULL,
    IN p_ProvidersJSON_Clear BOOLEAN DEFAULT FALSE,
    IN p_ProvidersJSON TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchExecutionLogs" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SearchExecutionLog"
    SET
        "SearchScopeID" = CASE WHEN p_SearchScopeID_Clear = TRUE THEN NULL ELSE COALESCE(p_SearchScopeID, "SearchScopeID") END,
        "UserID" = CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, "UserID") END,
        "AIAgentID" = CASE WHEN p_AIAgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AIAgentID, "AIAgentID") END,
        "Query" = COALESCE(p_Query, "Query"),
        "TotalDurationMs" = COALESCE(p_TotalDurationMs, "TotalDurationMs"),
        "ResultCount" = COALESCE(p_ResultCount, "ResultCount"),
        "RerankerName" = CASE WHEN p_RerankerName_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerName, "RerankerName") END,
        "RerankerCostCents" = CASE WHEN p_RerankerCostCents_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerCostCents, "RerankerCostCents") END,
        "Status" = COALESCE(p_Status, "Status"),
        "FailureReason" = CASE WHEN p_FailureReason_Clear = TRUE THEN NULL ELSE COALESCE(p_FailureReason, "FailureReason") END,
        "ProvidersJSON" = CASE WHEN p_ProvidersJSON_Clear = TRUE THEN NULL ELSE COALESCE(p_ProvidersJSON, "ProvidersJSON") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSearchExecutionLogs" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSearchExecutionLogs" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSearchExecutionLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSearchExecutionLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SearchExecutionLog"
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
           WHERE proname = 'spCreateSearchScopeExternalIndex'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSearchScopeExternalIndex"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_IndexType VARCHAR(40) DEFAULT NULL,
    IN p_VectorIndexID_Clear BOOLEAN DEFAULT FALSE,
    IN p_VectorIndexID UUID DEFAULT NULL,
    IN p_ExternalIndexName_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalIndexName VARCHAR(400) DEFAULT NULL,
    IN p_ExternalIndexConfig_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalIndexConfig TEXT DEFAULT NULL,
    IN p_MetadataFilter_Clear BOOLEAN DEFAULT FALSE,
    IN p_MetadataFilter TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopeExternalIndexes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SearchScopeExternalIndex"
            (
                "ID",
                "SearchScopeID",
                "IndexType",
                "VectorIndexID",
                "ExternalIndexName",
                "ExternalIndexConfig",
                "MetadataFilter"
            )
        VALUES
            (
                p_ID,
                p_SearchScopeID,
                COALESCE(p_IndexType, 'Vector'),
                CASE WHEN p_VectorIndexID_Clear = TRUE THEN NULL ELSE COALESCE(p_VectorIndexID, NULL) END,
                CASE WHEN p_ExternalIndexName_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalIndexName, NULL) END,
                CASE WHEN p_ExternalIndexConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalIndexConfig, NULL) END,
                CASE WHEN p_MetadataFilter_Clear = TRUE THEN NULL ELSE COALESCE(p_MetadataFilter, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SearchScopeExternalIndex"
            (
                "SearchScopeID",
                "IndexType",
                "VectorIndexID",
                "ExternalIndexName",
                "ExternalIndexConfig",
                "MetadataFilter"
            )
        VALUES
            (
                p_SearchScopeID,
                COALESCE(p_IndexType, 'Vector'),
                CASE WHEN p_VectorIndexID_Clear = TRUE THEN NULL ELSE COALESCE(p_VectorIndexID, NULL) END,
                CASE WHEN p_ExternalIndexName_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalIndexName, NULL) END,
                CASE WHEN p_ExternalIndexConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalIndexConfig, NULL) END,
                CASE WHEN p_MetadataFilter_Clear = TRUE THEN NULL ELSE COALESCE(p_MetadataFilter, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSearchScopeExternalIndexes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSearchScopeExternalIndex'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSearchScopeExternalIndex"(
    IN p_ID UUID,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_IndexType VARCHAR(40) DEFAULT NULL,
    IN p_VectorIndexID_Clear BOOLEAN DEFAULT FALSE,
    IN p_VectorIndexID UUID DEFAULT NULL,
    IN p_ExternalIndexName_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalIndexName VARCHAR(400) DEFAULT NULL,
    IN p_ExternalIndexConfig_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalIndexConfig TEXT DEFAULT NULL,
    IN p_MetadataFilter_Clear BOOLEAN DEFAULT FALSE,
    IN p_MetadataFilter TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopeExternalIndexes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SearchScopeExternalIndex"
    SET
        "SearchScopeID" = COALESCE(p_SearchScopeID, "SearchScopeID"),
        "IndexType" = COALESCE(p_IndexType, "IndexType"),
        "VectorIndexID" = CASE WHEN p_VectorIndexID_Clear = TRUE THEN NULL ELSE COALESCE(p_VectorIndexID, "VectorIndexID") END,
        "ExternalIndexName" = CASE WHEN p_ExternalIndexName_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalIndexName, "ExternalIndexName") END,
        "ExternalIndexConfig" = CASE WHEN p_ExternalIndexConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalIndexConfig, "ExternalIndexConfig") END,
        "MetadataFilter" = CASE WHEN p_MetadataFilter_Clear = TRUE THEN NULL ELSE COALESCE(p_MetadataFilter, "MetadataFilter") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSearchScopeExternalIndexes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSearchScopeExternalIndexes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSearchScopeExternalIndex'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSearchScopeExternalIndex"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SearchScopeExternalIndex"
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
           WHERE proname = 'spCreateSearchScopeEntity'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSearchScopeEntity"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_ExtraFilter_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExtraFilter TEXT DEFAULT NULL,
    IN p_UserSearchString_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserSearchString TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopeEntities" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SearchScopeEntity"
            (
                "ID",
                "SearchScopeID",
                "EntityID",
                "ExtraFilter",
                "UserSearchString"
            )
        VALUES
            (
                p_ID,
                p_SearchScopeID,
                p_EntityID,
                CASE WHEN p_ExtraFilter_Clear = TRUE THEN NULL ELSE COALESCE(p_ExtraFilter, NULL) END,
                CASE WHEN p_UserSearchString_Clear = TRUE THEN NULL ELSE COALESCE(p_UserSearchString, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SearchScopeEntity"
            (
                "SearchScopeID",
                "EntityID",
                "ExtraFilter",
                "UserSearchString"
            )
        VALUES
            (
                p_SearchScopeID,
                p_EntityID,
                CASE WHEN p_ExtraFilter_Clear = TRUE THEN NULL ELSE COALESCE(p_ExtraFilter, NULL) END,
                CASE WHEN p_UserSearchString_Clear = TRUE THEN NULL ELSE COALESCE(p_UserSearchString, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSearchScopeEntities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSearchScopeEntity'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSearchScopeEntity"(
    IN p_ID UUID,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_ExtraFilter_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExtraFilter TEXT DEFAULT NULL,
    IN p_UserSearchString_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserSearchString TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopeEntities" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SearchScopeEntity"
    SET
        "SearchScopeID" = COALESCE(p_SearchScopeID, "SearchScopeID"),
        "EntityID" = COALESCE(p_EntityID, "EntityID"),
        "ExtraFilter" = CASE WHEN p_ExtraFilter_Clear = TRUE THEN NULL ELSE COALESCE(p_ExtraFilter, "ExtraFilter") END,
        "UserSearchString" = CASE WHEN p_UserSearchString_Clear = TRUE THEN NULL ELSE COALESCE(p_UserSearchString, "UserSearchString") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSearchScopeEntities" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSearchScopeEntities" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSearchScopeEntity'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSearchScopeEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SearchScopeEntity"
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
           WHERE proname = 'spCreateSearchScopeProvider'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSearchScopeProvider"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_SearchProviderID UUID DEFAULT NULL,
    IN p_Enabled BOOLEAN DEFAULT NULL,
    IN p_MaxResultsOverride_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxResultsOverride INTEGER DEFAULT NULL,
    IN p_ProviderConfigOverride_Clear BOOLEAN DEFAULT FALSE,
    IN p_ProviderConfigOverride TEXT DEFAULT NULL,
    IN p_QueryTransformTemplateID_Clear BOOLEAN DEFAULT FALSE,
    IN p_QueryTransformTemplateID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopeProviders" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SearchScopeProvider"
            (
                "ID",
                "SearchScopeID",
                "SearchProviderID",
                "Enabled",
                "MaxResultsOverride",
                "ProviderConfigOverride",
                "QueryTransformTemplateID"
            )
        VALUES
            (
                p_ID,
                p_SearchScopeID,
                p_SearchProviderID,
                COALESCE(p_Enabled, TRUE),
                CASE WHEN p_MaxResultsOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxResultsOverride, NULL) END,
                CASE WHEN p_ProviderConfigOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_ProviderConfigOverride, NULL) END,
                CASE WHEN p_QueryTransformTemplateID_Clear = TRUE THEN NULL ELSE COALESCE(p_QueryTransformTemplateID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SearchScopeProvider"
            (
                "SearchScopeID",
                "SearchProviderID",
                "Enabled",
                "MaxResultsOverride",
                "ProviderConfigOverride",
                "QueryTransformTemplateID"
            )
        VALUES
            (
                p_SearchScopeID,
                p_SearchProviderID,
                COALESCE(p_Enabled, TRUE),
                CASE WHEN p_MaxResultsOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxResultsOverride, NULL) END,
                CASE WHEN p_ProviderConfigOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_ProviderConfigOverride, NULL) END,
                CASE WHEN p_QueryTransformTemplateID_Clear = TRUE THEN NULL ELSE COALESCE(p_QueryTransformTemplateID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSearchScopeProviders" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSearchScopeProvider'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSearchScopeProvider"(
    IN p_ID UUID,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_SearchProviderID UUID DEFAULT NULL,
    IN p_Enabled BOOLEAN DEFAULT NULL,
    IN p_MaxResultsOverride_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxResultsOverride INTEGER DEFAULT NULL,
    IN p_ProviderConfigOverride_Clear BOOLEAN DEFAULT FALSE,
    IN p_ProviderConfigOverride TEXT DEFAULT NULL,
    IN p_QueryTransformTemplateID_Clear BOOLEAN DEFAULT FALSE,
    IN p_QueryTransformTemplateID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopeProviders" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SearchScopeProvider"
    SET
        "SearchScopeID" = COALESCE(p_SearchScopeID, "SearchScopeID"),
        "SearchProviderID" = COALESCE(p_SearchProviderID, "SearchProviderID"),
        "Enabled" = COALESCE(p_Enabled, "Enabled"),
        "MaxResultsOverride" = CASE WHEN p_MaxResultsOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxResultsOverride, "MaxResultsOverride") END,
        "ProviderConfigOverride" = CASE WHEN p_ProviderConfigOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_ProviderConfigOverride, "ProviderConfigOverride") END,
        "QueryTransformTemplateID" = CASE WHEN p_QueryTransformTemplateID_Clear = TRUE THEN NULL ELSE COALESCE(p_QueryTransformTemplateID, "QueryTransformTemplateID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSearchScopeProviders" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSearchScopeProviders" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSearchScopeProvider'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSearchScopeProvider"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SearchScopeProvider"
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
           WHERE proname = 'spCreateSearchScopePermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSearchScopePermission"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_RoleID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RoleID UUID DEFAULT NULL,
    IN p_PermissionLevel VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopePermissions" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SearchScopePermission"
            (
                "ID",
                "SearchScopeID",
                "UserID",
                "RoleID",
                "PermissionLevel"
            )
        VALUES
            (
                p_ID,
                p_SearchScopeID,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_RoleID_Clear = TRUE THEN NULL ELSE COALESCE(p_RoleID, NULL) END,
                p_PermissionLevel
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SearchScopePermission"
            (
                "SearchScopeID",
                "UserID",
                "RoleID",
                "PermissionLevel"
            )
        VALUES
            (
                p_SearchScopeID,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_RoleID_Clear = TRUE THEN NULL ELSE COALESCE(p_RoleID, NULL) END,
                p_PermissionLevel
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSearchScopePermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSearchScopePermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSearchScopePermission"(
    IN p_ID UUID,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_RoleID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RoleID UUID DEFAULT NULL,
    IN p_PermissionLevel VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopePermissions" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SearchScopePermission"
    SET
        "SearchScopeID" = COALESCE(p_SearchScopeID, "SearchScopeID"),
        "UserID" = CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, "UserID") END,
        "RoleID" = CASE WHEN p_RoleID_Clear = TRUE THEN NULL ELSE COALESCE(p_RoleID, "RoleID") END,
        "PermissionLevel" = COALESCE(p_PermissionLevel, "PermissionLevel")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSearchScopePermissions" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSearchScopePermissions" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSearchScopePermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSearchScopePermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SearchScopePermission"
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
           WHERE proname = 'spCreateSearchScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSearchScope"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Icon_Clear BOOLEAN DEFAULT FALSE,
    IN p_Icon VARCHAR(200) DEFAULT NULL,
    IN p_IsGlobal BOOLEAN DEFAULT NULL,
    IN p_IsDefault BOOLEAN DEFAULT NULL,
    IN p_OwnerUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OwnerUserID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_StartAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ScopeConfig_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScopeConfig TEXT DEFAULT NULL,
    IN p_SearchContextConfig_Clear BOOLEAN DEFAULT FALSE,
    IN p_SearchContextConfig TEXT DEFAULT NULL,
    IN p_RerankerBudgetCents_Clear BOOLEAN DEFAULT FALSE,
    IN p_RerankerBudgetCents INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SearchScope"
            (
                "ID",
                "Name",
                "Description",
                "Icon",
                "IsGlobal",
                "IsDefault",
                "OwnerUserID",
                "Status",
                "StartAt",
                "EndAt",
                "ScopeConfig",
                "SearchContextConfig",
                "RerankerBudgetCents"
            )
        VALUES
            (
                p_ID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_Icon_Clear = TRUE THEN NULL ELSE COALESCE(p_Icon, NULL) END,
                COALESCE(p_IsGlobal, FALSE),
                COALESCE(p_IsDefault, FALSE),
                CASE WHEN p_OwnerUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_OwnerUserID, NULL) END,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, NULL) END,
                CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, NULL) END,
                CASE WHEN p_ScopeConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_ScopeConfig, NULL) END,
                CASE WHEN p_SearchContextConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_SearchContextConfig, NULL) END,
                CASE WHEN p_RerankerBudgetCents_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerBudgetCents, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SearchScope"
            (
                "Name",
                "Description",
                "Icon",
                "IsGlobal",
                "IsDefault",
                "OwnerUserID",
                "Status",
                "StartAt",
                "EndAt",
                "ScopeConfig",
                "SearchContextConfig",
                "RerankerBudgetCents"
            )
        VALUES
            (
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_Icon_Clear = TRUE THEN NULL ELSE COALESCE(p_Icon, NULL) END,
                COALESCE(p_IsGlobal, FALSE),
                COALESCE(p_IsDefault, FALSE),
                CASE WHEN p_OwnerUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_OwnerUserID, NULL) END,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, NULL) END,
                CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, NULL) END,
                CASE WHEN p_ScopeConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_ScopeConfig, NULL) END,
                CASE WHEN p_SearchContextConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_SearchContextConfig, NULL) END,
                CASE WHEN p_RerankerBudgetCents_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerBudgetCents, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSearchScopes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSearchScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSearchScope"(
    IN p_ID UUID,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Icon_Clear BOOLEAN DEFAULT FALSE,
    IN p_Icon VARCHAR(200) DEFAULT NULL,
    IN p_IsGlobal BOOLEAN DEFAULT NULL,
    IN p_IsDefault BOOLEAN DEFAULT NULL,
    IN p_OwnerUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OwnerUserID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_StartAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ScopeConfig_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScopeConfig TEXT DEFAULT NULL,
    IN p_SearchContextConfig_Clear BOOLEAN DEFAULT FALSE,
    IN p_SearchContextConfig TEXT DEFAULT NULL,
    IN p_RerankerBudgetCents_Clear BOOLEAN DEFAULT FALSE,
    IN p_RerankerBudgetCents INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SearchScope"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "Icon" = CASE WHEN p_Icon_Clear = TRUE THEN NULL ELSE COALESCE(p_Icon, "Icon") END,
        "IsGlobal" = COALESCE(p_IsGlobal, "IsGlobal"),
        "IsDefault" = COALESCE(p_IsDefault, "IsDefault"),
        "OwnerUserID" = CASE WHEN p_OwnerUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_OwnerUserID, "OwnerUserID") END,
        "Status" = COALESCE(p_Status, "Status"),
        "StartAt" = CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, "StartAt") END,
        "EndAt" = CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, "EndAt") END,
        "ScopeConfig" = CASE WHEN p_ScopeConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_ScopeConfig, "ScopeConfig") END,
        "SearchContextConfig" = CASE WHEN p_SearchContextConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_SearchContextConfig, "SearchContextConfig") END,
        "RerankerBudgetCents" = CASE WHEN p_RerankerBudgetCents_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerBudgetCents, "RerankerBudgetCents") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSearchScopes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSearchScopes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSearchScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSearchScope"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SearchScope"
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
           WHERE proname = 'spCreateSearchScopeTestQuery'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSearchScopeTestQuery"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_Label VARCHAR(200) DEFAULT NULL,
    IN p_Query TEXT DEFAULT NULL,
    IN p_ExpectedTopResultEntity_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpectedTopResultEntity VARCHAR(255) DEFAULT NULL,
    IN p_ExpectedTopResultRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpectedTopResultRecordID UUID DEFAULT NULL,
    IN p_Notes_Clear BOOLEAN DEFAULT FALSE,
    IN p_Notes TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopeTestQueries" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SearchScopeTestQuery"
            (
                "ID",
                "SearchScopeID",
                "Label",
                "Query",
                "ExpectedTopResultEntity",
                "ExpectedTopResultRecordID",
                "Notes"
            )
        VALUES
            (
                p_ID,
                p_SearchScopeID,
                p_Label,
                p_Query,
                CASE WHEN p_ExpectedTopResultEntity_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpectedTopResultEntity, NULL) END,
                CASE WHEN p_ExpectedTopResultRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpectedTopResultRecordID, NULL) END,
                CASE WHEN p_Notes_Clear = TRUE THEN NULL ELSE COALESCE(p_Notes, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SearchScopeTestQuery"
            (
                "SearchScopeID",
                "Label",
                "Query",
                "ExpectedTopResultEntity",
                "ExpectedTopResultRecordID",
                "Notes"
            )
        VALUES
            (
                p_SearchScopeID,
                p_Label,
                p_Query,
                CASE WHEN p_ExpectedTopResultEntity_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpectedTopResultEntity, NULL) END,
                CASE WHEN p_ExpectedTopResultRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpectedTopResultRecordID, NULL) END,
                CASE WHEN p_Notes_Clear = TRUE THEN NULL ELSE COALESCE(p_Notes, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSearchScopeTestQueries" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSearchScopeTestQuery'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSearchScopeTestQuery"(
    IN p_ID UUID,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_Label VARCHAR(200) DEFAULT NULL,
    IN p_Query TEXT DEFAULT NULL,
    IN p_ExpectedTopResultEntity_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpectedTopResultEntity VARCHAR(255) DEFAULT NULL,
    IN p_ExpectedTopResultRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpectedTopResultRecordID UUID DEFAULT NULL,
    IN p_Notes_Clear BOOLEAN DEFAULT FALSE,
    IN p_Notes TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopeTestQueries" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SearchScopeTestQuery"
    SET
        "SearchScopeID" = COALESCE(p_SearchScopeID, "SearchScopeID"),
        "Label" = COALESCE(p_Label, "Label"),
        "Query" = COALESCE(p_Query, "Query"),
        "ExpectedTopResultEntity" = CASE WHEN p_ExpectedTopResultEntity_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpectedTopResultEntity, "ExpectedTopResultEntity") END,
        "ExpectedTopResultRecordID" = CASE WHEN p_ExpectedTopResultRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpectedTopResultRecordID, "ExpectedTopResultRecordID") END,
        "Notes" = CASE WHEN p_Notes_Clear = TRUE THEN NULL ELSE COALESCE(p_Notes, "Notes") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSearchScopeTestQueries" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSearchScopeTestQueries" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSearchScopeTestQuery'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSearchScopeTestQuery"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SearchScopeTestQuery"
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
           WHERE proname = 'spCreateSearchScopeStorageAccount'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateSearchScopeStorageAccount"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_FileStorageAccountID UUID DEFAULT NULL,
    IN p_FolderPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_FolderPath VARCHAR(1000) DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopeStorageAccounts" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SearchScopeStorageAccount"
            (
                "ID",
                "SearchScopeID",
                "FileStorageAccountID",
                "FolderPath"
            )
        VALUES
            (
                p_ID,
                p_SearchScopeID,
                p_FileStorageAccountID,
                CASE WHEN p_FolderPath_Clear = TRUE THEN NULL ELSE COALESCE(p_FolderPath, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SearchScopeStorageAccount"
            (
                "SearchScopeID",
                "FileStorageAccountID",
                "FolderPath"
            )
        VALUES
            (
                p_SearchScopeID,
                p_FileStorageAccountID,
                CASE WHEN p_FolderPath_Clear = TRUE THEN NULL ELSE COALESCE(p_FolderPath, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSearchScopeStorageAccounts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateSearchScopeStorageAccount'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateSearchScopeStorageAccount"(
    IN p_ID UUID,
    IN p_SearchScopeID UUID DEFAULT NULL,
    IN p_FileStorageAccountID UUID DEFAULT NULL,
    IN p_FolderPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_FolderPath VARCHAR(1000) DEFAULT NULL
)
RETURNS SETOF __mj."vwSearchScopeStorageAccounts" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SearchScopeStorageAccount"
    SET
        "SearchScopeID" = COALESCE(p_SearchScopeID, "SearchScopeID"),
        "FileStorageAccountID" = COALESCE(p_FileStorageAccountID, "FileStorageAccountID"),
        "FolderPath" = CASE WHEN p_FolderPath_Clear = TRUE THEN NULL ELSE COALESCE(p_FolderPath, "FolderPath") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSearchScopeStorageAccounts" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSearchScopeStorageAccounts" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSearchScopeStorageAccount'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSearchScopeStorageAccount"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SearchScopeStorageAccount"
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
           WHERE proname = 'spCreateAIAgent'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgent"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name_Clear BOOLEAN DEFAULT FALSE,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_LogoURL_Clear BOOLEAN DEFAULT FALSE,
    IN p_LogoURL VARCHAR(255) DEFAULT NULL,
    IN p_ParentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_ExposeAsAction BOOLEAN DEFAULT NULL,
    IN p_ExecutionOrder INTEGER DEFAULT NULL,
    IN p_ExecutionMode VARCHAR(20) DEFAULT NULL,
    IN p_EnableContextCompression BOOLEAN DEFAULT NULL,
    IN p_ContextCompressionMessageThreshold_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionMessageThreshold INTEGER DEFAULT NULL,
    IN p_ContextCompressionPromptID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionPromptID UUID DEFAULT NULL,
    IN p_ContextCompressionMessageRetentionCount_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionMessageRetentionCount INTEGER DEFAULT NULL,
    IN p_TypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TypeID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_DriverClass_Clear BOOLEAN DEFAULT FALSE,
    IN p_DriverClass VARCHAR(255) DEFAULT NULL,
    IN p_IconClass_Clear BOOLEAN DEFAULT FALSE,
    IN p_IconClass VARCHAR(100) DEFAULT NULL,
    IN p_ModelSelectionMode VARCHAR(50) DEFAULT NULL,
    IN p_PayloadDownstreamPaths TEXT DEFAULT NULL,
    IN p_PayloadUpstreamPaths TEXT DEFAULT NULL,
    IN p_PayloadSelfReadPaths_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadSelfReadPaths TEXT DEFAULT NULL,
    IN p_PayloadSelfWritePaths_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadSelfWritePaths TEXT DEFAULT NULL,
    IN p_PayloadScope_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadScope TEXT DEFAULT NULL,
    IN p_FinalPayloadValidation_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalPayloadValidation TEXT DEFAULT NULL,
    IN p_FinalPayloadValidationMode VARCHAR(25) DEFAULT NULL,
    IN p_FinalPayloadValidationMaxRetries INTEGER DEFAULT NULL,
    IN p_MaxCostPerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxCostPerRun NUMERIC(10,4) DEFAULT NULL,
    IN p_MaxTokensPerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxTokensPerRun INTEGER DEFAULT NULL,
    IN p_MaxIterationsPerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxIterationsPerRun INTEGER DEFAULT NULL,
    IN p_MaxTimePerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxTimePerRun INTEGER DEFAULT NULL,
    IN p_MinExecutionsPerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MinExecutionsPerRun INTEGER DEFAULT NULL,
    IN p_MaxExecutionsPerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxExecutionsPerRun INTEGER DEFAULT NULL,
    IN p_StartingPayloadValidation_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartingPayloadValidation TEXT DEFAULT NULL,
    IN p_StartingPayloadValidationMode VARCHAR(25) DEFAULT NULL,
    IN p_DefaultPromptEffortLevel_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultPromptEffortLevel INTEGER DEFAULT NULL,
    IN p_ChatHandlingOption_Clear BOOLEAN DEFAULT FALSE,
    IN p_ChatHandlingOption VARCHAR(30) DEFAULT NULL,
    IN p_DefaultArtifactTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultArtifactTypeID UUID DEFAULT NULL,
    IN p_OwnerUserID UUID DEFAULT NULL,
    IN p_InvocationMode VARCHAR(20) DEFAULT NULL,
    IN p_ArtifactCreationMode VARCHAR(20) DEFAULT NULL,
    IN p_FunctionalRequirements_Clear BOOLEAN DEFAULT FALSE,
    IN p_FunctionalRequirements TEXT DEFAULT NULL,
    IN p_TechnicalDesign_Clear BOOLEAN DEFAULT FALSE,
    IN p_TechnicalDesign TEXT DEFAULT NULL,
    IN p_InjectNotes BOOLEAN DEFAULT NULL,
    IN p_MaxNotesToInject INTEGER DEFAULT NULL,
    IN p_NoteInjectionStrategy VARCHAR(20) DEFAULT NULL,
    IN p_InjectExamples BOOLEAN DEFAULT NULL,
    IN p_MaxExamplesToInject INTEGER DEFAULT NULL,
    IN p_ExampleInjectionStrategy VARCHAR(20) DEFAULT NULL,
    IN p_IsRestricted BOOLEAN DEFAULT NULL,
    IN p_MessageMode VARCHAR(50) DEFAULT NULL,
    IN p_MaxMessages_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxMessages INTEGER DEFAULT NULL,
    IN p_AttachmentStorageProviderID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AttachmentStorageProviderID UUID DEFAULT NULL,
    IN p_AttachmentRootPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_AttachmentRootPath VARCHAR(500) DEFAULT NULL,
    IN p_InlineStorageThresholdBytes_Clear BOOLEAN DEFAULT FALSE,
    IN p_InlineStorageThresholdBytes INTEGER DEFAULT NULL,
    IN p_AgentTypePromptParams_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentTypePromptParams TEXT DEFAULT NULL,
    IN p_ScopeConfig_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScopeConfig TEXT DEFAULT NULL,
    IN p_NoteRetentionDays_Clear BOOLEAN DEFAULT FALSE,
    IN p_NoteRetentionDays INTEGER DEFAULT NULL,
    IN p_ExampleRetentionDays_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExampleRetentionDays INTEGER DEFAULT NULL,
    IN p_AutoArchiveEnabled BOOLEAN DEFAULT NULL,
    IN p_RerankerConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_RerankerConfiguration TEXT DEFAULT NULL,
    IN p_CategoryID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CategoryID UUID DEFAULT NULL,
    IN p_AllowEphemeralClientTools BOOLEAN DEFAULT NULL,
    IN p_DefaultStorageAccountID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultStorageAccountID UUID DEFAULT NULL,
    IN p_SearchScopeAccess VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgents" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgent"
            (
                "ID",
                "Name",
                "Description",
                "LogoURL",
                "ParentID",
                "ExposeAsAction",
                "ExecutionOrder",
                "ExecutionMode",
                "EnableContextCompression",
                "ContextCompressionMessageThreshold",
                "ContextCompressionPromptID",
                "ContextCompressionMessageRetentionCount",
                "TypeID",
                "Status",
                "DriverClass",
                "IconClass",
                "ModelSelectionMode",
                "PayloadDownstreamPaths",
                "PayloadUpstreamPaths",
                "PayloadSelfReadPaths",
                "PayloadSelfWritePaths",
                "PayloadScope",
                "FinalPayloadValidation",
                "FinalPayloadValidationMode",
                "FinalPayloadValidationMaxRetries",
                "MaxCostPerRun",
                "MaxTokensPerRun",
                "MaxIterationsPerRun",
                "MaxTimePerRun",
                "MinExecutionsPerRun",
                "MaxExecutionsPerRun",
                "StartingPayloadValidation",
                "StartingPayloadValidationMode",
                "DefaultPromptEffortLevel",
                "ChatHandlingOption",
                "DefaultArtifactTypeID",
                "OwnerUserID",
                "InvocationMode",
                "ArtifactCreationMode",
                "FunctionalRequirements",
                "TechnicalDesign",
                "InjectNotes",
                "MaxNotesToInject",
                "NoteInjectionStrategy",
                "InjectExamples",
                "MaxExamplesToInject",
                "ExampleInjectionStrategy",
                "IsRestricted",
                "MessageMode",
                "MaxMessages",
                "AttachmentStorageProviderID",
                "AttachmentRootPath",
                "InlineStorageThresholdBytes",
                "AgentTypePromptParams",
                "ScopeConfig",
                "NoteRetentionDays",
                "ExampleRetentionDays",
                "AutoArchiveEnabled",
                "RerankerConfiguration",
                "CategoryID",
                "AllowEphemeralClientTools",
                "DefaultStorageAccountID",
                "SearchScopeAccess"
            )
        VALUES
            (
                p_ID,
                CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_LogoURL_Clear = TRUE THEN NULL ELSE COALESCE(p_LogoURL, NULL) END,
                CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, NULL) END,
                COALESCE(p_ExposeAsAction, FALSE),
                COALESCE(p_ExecutionOrder, 0),
                COALESCE(p_ExecutionMode, 'Sequential'),
                COALESCE(p_EnableContextCompression, FALSE),
                CASE WHEN p_ContextCompressionMessageThreshold_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageThreshold, NULL) END,
                CASE WHEN p_ContextCompressionPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionPromptID, NULL) END,
                CASE WHEN p_ContextCompressionMessageRetentionCount_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageRetentionCount, NULL) END,
                CASE WHEN p_TypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_TypeID, NULL) END,
                COALESCE(p_Status, 'Pending'),
                CASE WHEN p_DriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverClass, NULL) END,
                CASE WHEN p_IconClass_Clear = TRUE THEN NULL ELSE COALESCE(p_IconClass, NULL) END,
                COALESCE(p_ModelSelectionMode, 'Agent Type'),
                COALESCE(p_PayloadDownstreamPaths, '["*"]'),
                COALESCE(p_PayloadUpstreamPaths, '["*"]'),
                CASE WHEN p_PayloadSelfReadPaths_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadSelfReadPaths, NULL) END,
                CASE WHEN p_PayloadSelfWritePaths_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadSelfWritePaths, NULL) END,
                CASE WHEN p_PayloadScope_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadScope, NULL) END,
                CASE WHEN p_FinalPayloadValidation_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayloadValidation, NULL) END,
                COALESCE(p_FinalPayloadValidationMode, 'Retry'),
                COALESCE(p_FinalPayloadValidationMaxRetries, 3),
                CASE WHEN p_MaxCostPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxCostPerRun, NULL) END,
                CASE WHEN p_MaxTokensPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxTokensPerRun, NULL) END,
                CASE WHEN p_MaxIterationsPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxIterationsPerRun, NULL) END,
                CASE WHEN p_MaxTimePerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxTimePerRun, NULL) END,
                CASE WHEN p_MinExecutionsPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MinExecutionsPerRun, NULL) END,
                CASE WHEN p_MaxExecutionsPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxExecutionsPerRun, NULL) END,
                CASE WHEN p_StartingPayloadValidation_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayloadValidation, NULL) END,
                COALESCE(p_StartingPayloadValidationMode, 'Fail'),
                CASE WHEN p_DefaultPromptEffortLevel_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultPromptEffortLevel, NULL) END,
                CASE WHEN p_ChatHandlingOption_Clear = TRUE THEN NULL ELSE COALESCE(p_ChatHandlingOption, NULL) END,
                CASE WHEN p_DefaultArtifactTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultArtifactTypeID, NULL) END,
                CASE WHEN p_OwnerUserID = '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE COALESCE(p_OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                COALESCE(p_InvocationMode, 'Any'),
                COALESCE(p_ArtifactCreationMode, 'Always'),
                CASE WHEN p_FunctionalRequirements_Clear = TRUE THEN NULL ELSE COALESCE(p_FunctionalRequirements, NULL) END,
                CASE WHEN p_TechnicalDesign_Clear = TRUE THEN NULL ELSE COALESCE(p_TechnicalDesign, NULL) END,
                COALESCE(p_InjectNotes, TRUE),
                COALESCE(p_MaxNotesToInject, 5),
                COALESCE(p_NoteInjectionStrategy, 'Relevant'),
                COALESCE(p_InjectExamples, FALSE),
                COALESCE(p_MaxExamplesToInject, 3),
                COALESCE(p_ExampleInjectionStrategy, 'Semantic'),
                COALESCE(p_IsRestricted, FALSE),
                COALESCE(p_MessageMode, 'None'),
                CASE WHEN p_MaxMessages_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxMessages, NULL) END,
                CASE WHEN p_AttachmentStorageProviderID_Clear = TRUE THEN NULL ELSE COALESCE(p_AttachmentStorageProviderID, NULL) END,
                CASE WHEN p_AttachmentRootPath_Clear = TRUE THEN NULL ELSE COALESCE(p_AttachmentRootPath, NULL) END,
                CASE WHEN p_InlineStorageThresholdBytes_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineStorageThresholdBytes, NULL) END,
                CASE WHEN p_AgentTypePromptParams_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentTypePromptParams, NULL) END,
                CASE WHEN p_ScopeConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_ScopeConfig, NULL) END,
                CASE WHEN p_NoteRetentionDays_Clear = TRUE THEN NULL ELSE COALESCE(p_NoteRetentionDays, 90) END,
                CASE WHEN p_ExampleRetentionDays_Clear = TRUE THEN NULL ELSE COALESCE(p_ExampleRetentionDays, 180) END,
                COALESCE(p_AutoArchiveEnabled, TRUE),
                CASE WHEN p_RerankerConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerConfiguration, NULL) END,
                CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, NULL) END,
                COALESCE(p_AllowEphemeralClientTools, TRUE),
                CASE WHEN p_DefaultStorageAccountID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultStorageAccountID, NULL) END,
                COALESCE(p_SearchScopeAccess, 'None')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgent"
            (
                "Name",
                "Description",
                "LogoURL",
                "ParentID",
                "ExposeAsAction",
                "ExecutionOrder",
                "ExecutionMode",
                "EnableContextCompression",
                "ContextCompressionMessageThreshold",
                "ContextCompressionPromptID",
                "ContextCompressionMessageRetentionCount",
                "TypeID",
                "Status",
                "DriverClass",
                "IconClass",
                "ModelSelectionMode",
                "PayloadDownstreamPaths",
                "PayloadUpstreamPaths",
                "PayloadSelfReadPaths",
                "PayloadSelfWritePaths",
                "PayloadScope",
                "FinalPayloadValidation",
                "FinalPayloadValidationMode",
                "FinalPayloadValidationMaxRetries",
                "MaxCostPerRun",
                "MaxTokensPerRun",
                "MaxIterationsPerRun",
                "MaxTimePerRun",
                "MinExecutionsPerRun",
                "MaxExecutionsPerRun",
                "StartingPayloadValidation",
                "StartingPayloadValidationMode",
                "DefaultPromptEffortLevel",
                "ChatHandlingOption",
                "DefaultArtifactTypeID",
                "OwnerUserID",
                "InvocationMode",
                "ArtifactCreationMode",
                "FunctionalRequirements",
                "TechnicalDesign",
                "InjectNotes",
                "MaxNotesToInject",
                "NoteInjectionStrategy",
                "InjectExamples",
                "MaxExamplesToInject",
                "ExampleInjectionStrategy",
                "IsRestricted",
                "MessageMode",
                "MaxMessages",
                "AttachmentStorageProviderID",
                "AttachmentRootPath",
                "InlineStorageThresholdBytes",
                "AgentTypePromptParams",
                "ScopeConfig",
                "NoteRetentionDays",
                "ExampleRetentionDays",
                "AutoArchiveEnabled",
                "RerankerConfiguration",
                "CategoryID",
                "AllowEphemeralClientTools",
                "DefaultStorageAccountID",
                "SearchScopeAccess"
            )
        VALUES
            (
                CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_LogoURL_Clear = TRUE THEN NULL ELSE COALESCE(p_LogoURL, NULL) END,
                CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, NULL) END,
                COALESCE(p_ExposeAsAction, FALSE),
                COALESCE(p_ExecutionOrder, 0),
                COALESCE(p_ExecutionMode, 'Sequential'),
                COALESCE(p_EnableContextCompression, FALSE),
                CASE WHEN p_ContextCompressionMessageThreshold_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageThreshold, NULL) END,
                CASE WHEN p_ContextCompressionPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionPromptID, NULL) END,
                CASE WHEN p_ContextCompressionMessageRetentionCount_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageRetentionCount, NULL) END,
                CASE WHEN p_TypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_TypeID, NULL) END,
                COALESCE(p_Status, 'Pending'),
                CASE WHEN p_DriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverClass, NULL) END,
                CASE WHEN p_IconClass_Clear = TRUE THEN NULL ELSE COALESCE(p_IconClass, NULL) END,
                COALESCE(p_ModelSelectionMode, 'Agent Type'),
                COALESCE(p_PayloadDownstreamPaths, '["*"]'),
                COALESCE(p_PayloadUpstreamPaths, '["*"]'),
                CASE WHEN p_PayloadSelfReadPaths_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadSelfReadPaths, NULL) END,
                CASE WHEN p_PayloadSelfWritePaths_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadSelfWritePaths, NULL) END,
                CASE WHEN p_PayloadScope_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadScope, NULL) END,
                CASE WHEN p_FinalPayloadValidation_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayloadValidation, NULL) END,
                COALESCE(p_FinalPayloadValidationMode, 'Retry'),
                COALESCE(p_FinalPayloadValidationMaxRetries, 3),
                CASE WHEN p_MaxCostPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxCostPerRun, NULL) END,
                CASE WHEN p_MaxTokensPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxTokensPerRun, NULL) END,
                CASE WHEN p_MaxIterationsPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxIterationsPerRun, NULL) END,
                CASE WHEN p_MaxTimePerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxTimePerRun, NULL) END,
                CASE WHEN p_MinExecutionsPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MinExecutionsPerRun, NULL) END,
                CASE WHEN p_MaxExecutionsPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxExecutionsPerRun, NULL) END,
                CASE WHEN p_StartingPayloadValidation_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayloadValidation, NULL) END,
                COALESCE(p_StartingPayloadValidationMode, 'Fail'),
                CASE WHEN p_DefaultPromptEffortLevel_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultPromptEffortLevel, NULL) END,
                CASE WHEN p_ChatHandlingOption_Clear = TRUE THEN NULL ELSE COALESCE(p_ChatHandlingOption, NULL) END,
                CASE WHEN p_DefaultArtifactTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultArtifactTypeID, NULL) END,
                CASE WHEN p_OwnerUserID = '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE COALESCE(p_OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                COALESCE(p_InvocationMode, 'Any'),
                COALESCE(p_ArtifactCreationMode, 'Always'),
                CASE WHEN p_FunctionalRequirements_Clear = TRUE THEN NULL ELSE COALESCE(p_FunctionalRequirements, NULL) END,
                CASE WHEN p_TechnicalDesign_Clear = TRUE THEN NULL ELSE COALESCE(p_TechnicalDesign, NULL) END,
                COALESCE(p_InjectNotes, TRUE),
                COALESCE(p_MaxNotesToInject, 5),
                COALESCE(p_NoteInjectionStrategy, 'Relevant'),
                COALESCE(p_InjectExamples, FALSE),
                COALESCE(p_MaxExamplesToInject, 3),
                COALESCE(p_ExampleInjectionStrategy, 'Semantic'),
                COALESCE(p_IsRestricted, FALSE),
                COALESCE(p_MessageMode, 'None'),
                CASE WHEN p_MaxMessages_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxMessages, NULL) END,
                CASE WHEN p_AttachmentStorageProviderID_Clear = TRUE THEN NULL ELSE COALESCE(p_AttachmentStorageProviderID, NULL) END,
                CASE WHEN p_AttachmentRootPath_Clear = TRUE THEN NULL ELSE COALESCE(p_AttachmentRootPath, NULL) END,
                CASE WHEN p_InlineStorageThresholdBytes_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineStorageThresholdBytes, NULL) END,
                CASE WHEN p_AgentTypePromptParams_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentTypePromptParams, NULL) END,
                CASE WHEN p_ScopeConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_ScopeConfig, NULL) END,
                CASE WHEN p_NoteRetentionDays_Clear = TRUE THEN NULL ELSE COALESCE(p_NoteRetentionDays, 90) END,
                CASE WHEN p_ExampleRetentionDays_Clear = TRUE THEN NULL ELSE COALESCE(p_ExampleRetentionDays, 180) END,
                COALESCE(p_AutoArchiveEnabled, TRUE),
                CASE WHEN p_RerankerConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerConfiguration, NULL) END,
                CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, NULL) END,
                COALESCE(p_AllowEphemeralClientTools, TRUE),
                CASE WHEN p_DefaultStorageAccountID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultStorageAccountID, NULL) END,
                COALESCE(p_SearchScopeAccess, 'None')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgents" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgent'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgent"(
    IN p_ID UUID,
    IN p_Name_Clear BOOLEAN DEFAULT FALSE,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_LogoURL_Clear BOOLEAN DEFAULT FALSE,
    IN p_LogoURL VARCHAR(255) DEFAULT NULL,
    IN p_ParentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_ExposeAsAction BOOLEAN DEFAULT NULL,
    IN p_ExecutionOrder INTEGER DEFAULT NULL,
    IN p_ExecutionMode VARCHAR(20) DEFAULT NULL,
    IN p_EnableContextCompression BOOLEAN DEFAULT NULL,
    IN p_ContextCompressionMessageThreshold_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionMessageThreshold INTEGER DEFAULT NULL,
    IN p_ContextCompressionPromptID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionPromptID UUID DEFAULT NULL,
    IN p_ContextCompressionMessageRetentionCount_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionMessageRetentionCount INTEGER DEFAULT NULL,
    IN p_TypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TypeID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_DriverClass_Clear BOOLEAN DEFAULT FALSE,
    IN p_DriverClass VARCHAR(255) DEFAULT NULL,
    IN p_IconClass_Clear BOOLEAN DEFAULT FALSE,
    IN p_IconClass VARCHAR(100) DEFAULT NULL,
    IN p_ModelSelectionMode VARCHAR(50) DEFAULT NULL,
    IN p_PayloadDownstreamPaths TEXT DEFAULT NULL,
    IN p_PayloadUpstreamPaths TEXT DEFAULT NULL,
    IN p_PayloadSelfReadPaths_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadSelfReadPaths TEXT DEFAULT NULL,
    IN p_PayloadSelfWritePaths_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadSelfWritePaths TEXT DEFAULT NULL,
    IN p_PayloadScope_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadScope TEXT DEFAULT NULL,
    IN p_FinalPayloadValidation_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalPayloadValidation TEXT DEFAULT NULL,
    IN p_FinalPayloadValidationMode VARCHAR(25) DEFAULT NULL,
    IN p_FinalPayloadValidationMaxRetries INTEGER DEFAULT NULL,
    IN p_MaxCostPerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxCostPerRun NUMERIC(10,4) DEFAULT NULL,
    IN p_MaxTokensPerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxTokensPerRun INTEGER DEFAULT NULL,
    IN p_MaxIterationsPerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxIterationsPerRun INTEGER DEFAULT NULL,
    IN p_MaxTimePerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxTimePerRun INTEGER DEFAULT NULL,
    IN p_MinExecutionsPerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MinExecutionsPerRun INTEGER DEFAULT NULL,
    IN p_MaxExecutionsPerRun_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxExecutionsPerRun INTEGER DEFAULT NULL,
    IN p_StartingPayloadValidation_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartingPayloadValidation TEXT DEFAULT NULL,
    IN p_StartingPayloadValidationMode VARCHAR(25) DEFAULT NULL,
    IN p_DefaultPromptEffortLevel_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultPromptEffortLevel INTEGER DEFAULT NULL,
    IN p_ChatHandlingOption_Clear BOOLEAN DEFAULT FALSE,
    IN p_ChatHandlingOption VARCHAR(30) DEFAULT NULL,
    IN p_DefaultArtifactTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultArtifactTypeID UUID DEFAULT NULL,
    IN p_OwnerUserID UUID DEFAULT NULL,
    IN p_InvocationMode VARCHAR(20) DEFAULT NULL,
    IN p_ArtifactCreationMode VARCHAR(20) DEFAULT NULL,
    IN p_FunctionalRequirements_Clear BOOLEAN DEFAULT FALSE,
    IN p_FunctionalRequirements TEXT DEFAULT NULL,
    IN p_TechnicalDesign_Clear BOOLEAN DEFAULT FALSE,
    IN p_TechnicalDesign TEXT DEFAULT NULL,
    IN p_InjectNotes BOOLEAN DEFAULT NULL,
    IN p_MaxNotesToInject INTEGER DEFAULT NULL,
    IN p_NoteInjectionStrategy VARCHAR(20) DEFAULT NULL,
    IN p_InjectExamples BOOLEAN DEFAULT NULL,
    IN p_MaxExamplesToInject INTEGER DEFAULT NULL,
    IN p_ExampleInjectionStrategy VARCHAR(20) DEFAULT NULL,
    IN p_IsRestricted BOOLEAN DEFAULT NULL,
    IN p_MessageMode VARCHAR(50) DEFAULT NULL,
    IN p_MaxMessages_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxMessages INTEGER DEFAULT NULL,
    IN p_AttachmentStorageProviderID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AttachmentStorageProviderID UUID DEFAULT NULL,
    IN p_AttachmentRootPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_AttachmentRootPath VARCHAR(500) DEFAULT NULL,
    IN p_InlineStorageThresholdBytes_Clear BOOLEAN DEFAULT FALSE,
    IN p_InlineStorageThresholdBytes INTEGER DEFAULT NULL,
    IN p_AgentTypePromptParams_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentTypePromptParams TEXT DEFAULT NULL,
    IN p_ScopeConfig_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScopeConfig TEXT DEFAULT NULL,
    IN p_NoteRetentionDays_Clear BOOLEAN DEFAULT FALSE,
    IN p_NoteRetentionDays INTEGER DEFAULT NULL,
    IN p_ExampleRetentionDays_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExampleRetentionDays INTEGER DEFAULT NULL,
    IN p_AutoArchiveEnabled BOOLEAN DEFAULT NULL,
    IN p_RerankerConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_RerankerConfiguration TEXT DEFAULT NULL,
    IN p_CategoryID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CategoryID UUID DEFAULT NULL,
    IN p_AllowEphemeralClientTools BOOLEAN DEFAULT NULL,
    IN p_DefaultStorageAccountID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultStorageAccountID UUID DEFAULT NULL,
    IN p_SearchScopeAccess VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgents" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgent"
    SET
        "Name" = CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, "Name") END,
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "LogoURL" = CASE WHEN p_LogoURL_Clear = TRUE THEN NULL ELSE COALESCE(p_LogoURL, "LogoURL") END,
        "ParentID" = CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, "ParentID") END,
        "ExposeAsAction" = COALESCE(p_ExposeAsAction, "ExposeAsAction"),
        "ExecutionOrder" = COALESCE(p_ExecutionOrder, "ExecutionOrder"),
        "ExecutionMode" = COALESCE(p_ExecutionMode, "ExecutionMode"),
        "EnableContextCompression" = COALESCE(p_EnableContextCompression, "EnableContextCompression"),
        "ContextCompressionMessageThreshold" = CASE WHEN p_ContextCompressionMessageThreshold_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageThreshold, "ContextCompressionMessageThreshold") END,
        "ContextCompressionPromptID" = CASE WHEN p_ContextCompressionPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionPromptID, "ContextCompressionPromptID") END,
        "ContextCompressionMessageRetentionCount" = CASE WHEN p_ContextCompressionMessageRetentionCount_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageRetentionCount, "ContextCompressionMessageRetentionCount") END,
        "TypeID" = CASE WHEN p_TypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_TypeID, "TypeID") END,
        "Status" = COALESCE(p_Status, "Status"),
        "DriverClass" = CASE WHEN p_DriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverClass, "DriverClass") END,
        "IconClass" = CASE WHEN p_IconClass_Clear = TRUE THEN NULL ELSE COALESCE(p_IconClass, "IconClass") END,
        "ModelSelectionMode" = COALESCE(p_ModelSelectionMode, "ModelSelectionMode"),
        "PayloadDownstreamPaths" = COALESCE(p_PayloadDownstreamPaths, "PayloadDownstreamPaths"),
        "PayloadUpstreamPaths" = COALESCE(p_PayloadUpstreamPaths, "PayloadUpstreamPaths"),
        "PayloadSelfReadPaths" = CASE WHEN p_PayloadSelfReadPaths_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadSelfReadPaths, "PayloadSelfReadPaths") END,
        "PayloadSelfWritePaths" = CASE WHEN p_PayloadSelfWritePaths_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadSelfWritePaths, "PayloadSelfWritePaths") END,
        "PayloadScope" = CASE WHEN p_PayloadScope_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadScope, "PayloadScope") END,
        "FinalPayloadValidation" = CASE WHEN p_FinalPayloadValidation_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayloadValidation, "FinalPayloadValidation") END,
        "FinalPayloadValidationMode" = COALESCE(p_FinalPayloadValidationMode, "FinalPayloadValidationMode"),
        "FinalPayloadValidationMaxRetries" = COALESCE(p_FinalPayloadValidationMaxRetries, "FinalPayloadValidationMaxRetries"),
        "MaxCostPerRun" = CASE WHEN p_MaxCostPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxCostPerRun, "MaxCostPerRun") END,
        "MaxTokensPerRun" = CASE WHEN p_MaxTokensPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxTokensPerRun, "MaxTokensPerRun") END,
        "MaxIterationsPerRun" = CASE WHEN p_MaxIterationsPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxIterationsPerRun, "MaxIterationsPerRun") END,
        "MaxTimePerRun" = CASE WHEN p_MaxTimePerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxTimePerRun, "MaxTimePerRun") END,
        "MinExecutionsPerRun" = CASE WHEN p_MinExecutionsPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MinExecutionsPerRun, "MinExecutionsPerRun") END,
        "MaxExecutionsPerRun" = CASE WHEN p_MaxExecutionsPerRun_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxExecutionsPerRun, "MaxExecutionsPerRun") END,
        "StartingPayloadValidation" = CASE WHEN p_StartingPayloadValidation_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayloadValidation, "StartingPayloadValidation") END,
        "StartingPayloadValidationMode" = COALESCE(p_StartingPayloadValidationMode, "StartingPayloadValidationMode"),
        "DefaultPromptEffortLevel" = CASE WHEN p_DefaultPromptEffortLevel_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultPromptEffortLevel, "DefaultPromptEffortLevel") END,
        "ChatHandlingOption" = CASE WHEN p_ChatHandlingOption_Clear = TRUE THEN NULL ELSE COALESCE(p_ChatHandlingOption, "ChatHandlingOption") END,
        "DefaultArtifactTypeID" = CASE WHEN p_DefaultArtifactTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultArtifactTypeID, "DefaultArtifactTypeID") END,
        "OwnerUserID" = COALESCE(p_OwnerUserID, "OwnerUserID"),
        "InvocationMode" = COALESCE(p_InvocationMode, "InvocationMode"),
        "ArtifactCreationMode" = COALESCE(p_ArtifactCreationMode, "ArtifactCreationMode"),
        "FunctionalRequirements" = CASE WHEN p_FunctionalRequirements_Clear = TRUE THEN NULL ELSE COALESCE(p_FunctionalRequirements, "FunctionalRequirements") END,
        "TechnicalDesign" = CASE WHEN p_TechnicalDesign_Clear = TRUE THEN NULL ELSE COALESCE(p_TechnicalDesign, "TechnicalDesign") END,
        "InjectNotes" = COALESCE(p_InjectNotes, "InjectNotes"),
        "MaxNotesToInject" = COALESCE(p_MaxNotesToInject, "MaxNotesToInject"),
        "NoteInjectionStrategy" = COALESCE(p_NoteInjectionStrategy, "NoteInjectionStrategy"),
        "InjectExamples" = COALESCE(p_InjectExamples, "InjectExamples"),
        "MaxExamplesToInject" = COALESCE(p_MaxExamplesToInject, "MaxExamplesToInject"),
        "ExampleInjectionStrategy" = COALESCE(p_ExampleInjectionStrategy, "ExampleInjectionStrategy"),
        "IsRestricted" = COALESCE(p_IsRestricted, "IsRestricted"),
        "MessageMode" = COALESCE(p_MessageMode, "MessageMode"),
        "MaxMessages" = CASE WHEN p_MaxMessages_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxMessages, "MaxMessages") END,
        "AttachmentStorageProviderID" = CASE WHEN p_AttachmentStorageProviderID_Clear = TRUE THEN NULL ELSE COALESCE(p_AttachmentStorageProviderID, "AttachmentStorageProviderID") END,
        "AttachmentRootPath" = CASE WHEN p_AttachmentRootPath_Clear = TRUE THEN NULL ELSE COALESCE(p_AttachmentRootPath, "AttachmentRootPath") END,
        "InlineStorageThresholdBytes" = CASE WHEN p_InlineStorageThresholdBytes_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineStorageThresholdBytes, "InlineStorageThresholdBytes") END,
        "AgentTypePromptParams" = CASE WHEN p_AgentTypePromptParams_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentTypePromptParams, "AgentTypePromptParams") END,
        "ScopeConfig" = CASE WHEN p_ScopeConfig_Clear = TRUE THEN NULL ELSE COALESCE(p_ScopeConfig, "ScopeConfig") END,
        "NoteRetentionDays" = CASE WHEN p_NoteRetentionDays_Clear = TRUE THEN NULL ELSE COALESCE(p_NoteRetentionDays, "NoteRetentionDays") END,
        "ExampleRetentionDays" = CASE WHEN p_ExampleRetentionDays_Clear = TRUE THEN NULL ELSE COALESCE(p_ExampleRetentionDays, "ExampleRetentionDays") END,
        "AutoArchiveEnabled" = COALESCE(p_AutoArchiveEnabled, "AutoArchiveEnabled"),
        "RerankerConfiguration" = CASE WHEN p_RerankerConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_RerankerConfiguration, "RerankerConfiguration") END,
        "CategoryID" = CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, "CategoryID") END,
        "AllowEphemeralClientTools" = COALESCE(p_AllowEphemeralClientTools, "AllowEphemeralClientTools"),
        "DefaultStorageAccountID" = CASE WHEN p_DefaultStorageAccountID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultStorageAccountID, "DefaultStorageAccountID") END,
        "SearchScopeAccess" = COALESCE(p_SearchScopeAccess, "SearchScopeAccess")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgents" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgents" WHERE "ID" = p_ID;
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
    p_MJAIAgentPermissions_AgentIDID UUID;
    p_MJAIAgentPrompts_AgentIDID UUID;
    p_MJAIAgentRelationships_AgentIDID UUID;
    p_MJAIAgentRelationships_SubAgentIDID UUID;
    p_MJAIAgentRequests_AgentIDID UUID;
    p_MJAIAgentRuns_AgentIDID UUID;
    p_MJAIAgentSearchScopes_AgentIDID UUID;
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


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore" FROM __mj."AIAgentNote" WHERE "AgentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentNotes_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_AgentIDID, p_AgentID_Clear => 1, p_AgentID => p_MJAIAgentNotes_AgentID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_AgentID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_AgentID_Note, p_UserID => p_MJAIAgentNotes_AgentID_UserID, p_Type => p_MJAIAgentNotes_AgentID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_AgentID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_AgentID_Comments, p_Status => p_MJAIAgentNotes_AgentID_Status, p_SourceConversationID => p_MJAIAgentNotes_AgentID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentNotes_AgentID_SourceConversationDetailID, p_SourceAIAgentRunID => p_MJAIAgentNotes_AgentID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_AgentID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_AgentID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_AgentID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentNotes_AgentID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_AgentID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_AgentID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_AgentID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, p_ConsolidationCount => p_MJAIAgentNotes_AgentID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_AgentID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_AgentID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_AgentID_ImportanceScore);

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


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess" FROM __mj."AIAgent" WHERE "ParentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgents_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ParentIDID, p_Name => p_MJAIAgents_ParentID_Name, p_Description => p_MJAIAgents_ParentID_Description, p_LogoURL => p_MJAIAgents_ParentID_LogoURL, p_ParentID_Clear => 1, p_ParentID => p_MJAIAgents_ParentID_ParentID, p_ExposeAsAction => p_MJAIAgents_ParentID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ParentID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ParentID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ParentID_EnableContextCompression, p_ContextCompressionMessageThreshold => p_MJAIAgents_ParentID_ContextCompressionMessageThreshold, p_ContextCompressionPromptID => p_MJAIAgents_ParentID_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, p_TypeID => p_MJAIAgents_ParentID_TypeID, p_Status => p_MJAIAgents_ParentID_Status, p_DriverClass => p_MJAIAgents_ParentID_DriverClass, p_IconClass => p_MJAIAgents_ParentID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ParentID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ParentID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ParentID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ParentID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ParentID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ParentID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ParentID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ParentID_FinalPayloadValidationMode, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, p_MaxCostPerRun => p_MJAIAgents_ParentID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ParentID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ParentID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ParentID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ParentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ParentID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ParentID_StartingPayloadValidation, p_StartingPayloadValidationMode => p_MJAIAgents_ParentID_StartingPayloadValidationMode, p_DefaultPromptEffortLevel => p_MJAIAgents_ParentID_DefaultPromptEffortLevel, p_ChatHandlingOption => p_MJAIAgents_ParentID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ParentID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ParentID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ParentID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ParentID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ParentID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ParentID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ParentID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ParentID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ParentID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ParentID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ParentID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ParentID_ExampleInjectionStrategy, p_IsRestricted => p_MJAIAgents_ParentID_IsRestricted, p_MessageMode => p_MJAIAgents_ParentID_MessageMode, p_MaxMessages => p_MJAIAgents_ParentID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ParentID_AttachmentStorageProviderID, p_AttachmentRootPath => p_MJAIAgents_ParentID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ParentID_InlineStorageThresholdBytes, p_AgentTypePromptParams => p_MJAIAgents_ParentID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ParentID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ParentID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ParentID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ParentID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ParentID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ParentID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ParentID_AllowEphemeralClientTools, p_DefaultStorageAccountID => p_MJAIAgents_ParentID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_ParentID_SearchScopeAccess);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "AgentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIPromptRuns_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_AgentIDID, p_PromptID => p_MJAIPromptRuns_AgentID_PromptID, p_ModelID => p_MJAIPromptRuns_AgentID_ModelID, p_VendorID => p_MJAIPromptRuns_AgentID_VendorID, p_AgentID_Clear => 1, p_AgentID => p_MJAIPromptRuns_AgentID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_AgentID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_AgentID_RunAt, p_CompletedAt => p_MJAIPromptRuns_AgentID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_AgentID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_AgentID_Messages, p_Result => p_MJAIPromptRuns_AgentID_Result, p_TokensUsed => p_MJAIPromptRuns_AgentID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_AgentID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_AgentID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_AgentID_TotalCost, p_Success => p_MJAIPromptRuns_AgentID_Success, p_ErrorMessage => p_MJAIPromptRuns_AgentID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_AgentID_ParentID, p_RunType => p_MJAIPromptRuns_AgentID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_AgentID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_AgentID_AgentRunID, p_Cost => p_MJAIPromptRuns_AgentID_Cost, p_CostCurrency => p_MJAIPromptRuns_AgentID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_AgentID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_AgentID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_AgentID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_AgentID_Temperature, p_TopP => p_MJAIPromptRuns_AgentID_TopP, p_TopK => p_MJAIPromptRuns_AgentID_TopK, p_MinP => p_MJAIPromptRuns_AgentID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_AgentID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_AgentID_PresencePenalty, p_Seed => p_MJAIPromptRuns_AgentID_Seed, p_StopSequences => p_MJAIPromptRuns_AgentID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_AgentID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_AgentID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_AgentID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_AgentID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_AgentID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_AgentID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_AgentID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_AgentID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_AgentID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_AgentID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_AgentID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_AgentID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_AgentID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_AgentID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_AgentID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_AgentID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_AgentID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_AgentID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_AgentID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_AgentID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_AgentID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_AgentID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_AgentID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_AgentID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_AgentID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_AgentID_ModelSelection, p_Status => p_MJAIPromptRuns_AgentID_Status, p_Cancelled => p_MJAIPromptRuns_AgentID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_AgentID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_AgentID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_AgentID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_AgentID_CacheHit, p_CacheKey => p_MJAIPromptRuns_AgentID_CacheKey, p_JudgeID => p_MJAIPromptRuns_AgentID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_AgentID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_AgentID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_AgentID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_AgentID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_AgentID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_AgentID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_AgentID_QueueTime, p_PromptTime => p_MJAIPromptRuns_AgentID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_AgentID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_AgentID_EffortLevel, p_RunName => p_MJAIPromptRuns_AgentID_RunName, p_Comments => p_MJAIPromptRuns_AgentID_Comments, p_TestRunID => p_MJAIPromptRuns_AgentID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_AgentID_AssistantPrefill);

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


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged" FROM __mj."ConversationDetail" WHERE "AgentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJConversationDetails_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_AgentIDID, p_ConversationID => p_MJConversationDetails_AgentID_ConversationID, p_ExternalID => p_MJConversationDetails_AgentID_ExternalID, p_Role => p_MJConversationDetails_AgentID_Role, p_Message => p_MJConversationDetails_AgentID_Message, p_Error => p_MJConversationDetails_AgentID_Error, p_HiddenToUser => p_MJConversationDetails_AgentID_HiddenToUser, p_UserRating => p_MJConversationDetails_AgentID_UserRating, p_UserFeedback => p_MJConversationDetails_AgentID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_AgentID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_AgentID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_AgentID_UserID, p_ArtifactID => p_MJConversationDetails_AgentID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_AgentID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_AgentID_CompletionTime, p_IsPinned => p_MJConversationDetails_AgentID_IsPinned, p_ParentID => p_MJConversationDetails_AgentID_ParentID, p_AgentID_Clear => 1, p_AgentID => p_MJConversationDetails_AgentID_AgentID, p_Status => p_MJConversationDetails_AgentID_Status, p_SuggestedResponses => p_MJConversationDetails_AgentID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_AgentID_TestRunID, p_ResponseForm => p_MJConversationDetails_AgentID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_AgentID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_AgentID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_AgentID_OriginalMessageChanged);

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
           WHERE proname = 'spDeleteAIPrompt'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIPrompt"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJActions_DefaultCompactPromptIDID UUID;
    p_MJActions_DefaultCompactPromptID_CategoryID UUID;
    p_MJActions_DefaultCompactPromptID_Name VARCHAR(425);
    p_MJActions_DefaultCompactPromptID_Description TEXT;
    p_MJActions_DefaultCompactPromptID_Type VARCHAR(20);
    p_MJActions_DefaultCompactPromptID_UserPrompt TEXT;
    p_MJActions_DefaultCompactPromptID_UserComments TEXT;
    p_MJActions_DefaultCompactPromptID_Code TEXT;
    p_MJActions_DefaultCompactPromptID_CodeComments TEXT;
    p_MJActions_DefaultCompactPromptID_CodeApprovalStatus VARCHAR(20);
    p_MJActions_DefaultCompactPromptID_CodeApprovalComments TEXT;
    p_MJActions_DefaultCompactPromptID_CodeApprovedByUserID UUID;
    p_MJActions_DefaultCompactPromptID_CodeApprovedAt TIMESTAMPTZ;
    p_MJActions_DefaultCompactPromptID_CodeLocked BOOLEAN;
    p_MJActions_DefaultCompactPromptID_ForceCodeGeneration BOOLEAN;
    p_MJActions_DefaultCompactPromptID_RetentionPeriod INTEGER;
    p_MJActions_DefaultCompactPromptID_Status VARCHAR(20);
    p_MJActions_DefaultCompactPromptID_DriverClass VARCHAR(255);
    p_MJActions_DefaultCompactPromptID_ParentID UUID;
    p_MJActions_DefaultCompactPromptID_IconClass VARCHAR(100);
    p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID UUID;
    p_MJActions_DefaultCompactPromptID_Config TEXT;
    p_MJActions_DefaultCompactPromptID_RuntimeActionConfiguration TEXT;
    p_MJActions_DefaultCompactPromptID_MaxExecutionTimeMS INTEGER;
    p_MJActions_DefaultCompactPromptID_CreatedByAgentID UUID;
    p_MJAIAgentActions_CompactPromptIDID UUID;
    p_MJAIAgentActions_CompactPromptID_AgentID UUID;
    p_MJAIAgentActions_CompactPromptID_ActionID UUID;
    p_MJAIAgentActions_CompactPromptID_Status VARCHAR(15);
    p_MJAIAgentActions_CompactPromptID_MinExecutionsPerRun INTEGER;
    p_MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgentActions_CompactPromptID_ResultExpirationTurns INTEGER;
    p_MJAIAgentActions_CompactPromptID_ResultExpirationMode VARCHAR(20);
    p_MJAIAgentActions_CompactPromptID_CompactMode VARCHAR(20);
    p_MJAIAgentActions_CompactPromptID_CompactLength INTEGER;
    p_MJAIAgentActions_CompactPromptID_CompactPromptID UUID;
    p_MJAIAgentPrompts_PromptIDID UUID;
    p_MJAIAgentSteps_PromptIDID UUID;
    p_MJAIAgentSteps_PromptID_AgentID UUID;
    p_MJAIAgentSteps_PromptID_Name VARCHAR(255);
    p_MJAIAgentSteps_PromptID_Description TEXT;
    p_MJAIAgentSteps_PromptID_StepType VARCHAR(20);
    p_MJAIAgentSteps_PromptID_StartingStep BOOLEAN;
    p_MJAIAgentSteps_PromptID_TimeoutSeconds INTEGER;
    p_MJAIAgentSteps_PromptID_RetryCount INTEGER;
    p_MJAIAgentSteps_PromptID_OnErrorBehavior VARCHAR(20);
    p_MJAIAgentSteps_PromptID_ActionID UUID;
    p_MJAIAgentSteps_PromptID_SubAgentID UUID;
    p_MJAIAgentSteps_PromptID_PromptID UUID;
    p_MJAIAgentSteps_PromptID_ActionOutputMapping TEXT;
    p_MJAIAgentSteps_PromptID_PositionX INTEGER;
    p_MJAIAgentSteps_PromptID_PositionY INTEGER;
    p_MJAIAgentSteps_PromptID_Width INTEGER;
    p_MJAIAgentSteps_PromptID_Height INTEGER;
    p_MJAIAgentSteps_PromptID_Status VARCHAR(20);
    p_MJAIAgentSteps_PromptID_ActionInputMapping TEXT;
    p_MJAIAgentSteps_PromptID_LoopBodyType VARCHAR(50);
    p_MJAIAgentSteps_PromptID_Configuration TEXT;
    p_MJAIAgentTypes_SystemPromptIDID UUID;
    p_MJAIAgentTypes_SystemPromptID_Name VARCHAR(100);
    p_MJAIAgentTypes_SystemPromptID_Description TEXT;
    p_MJAIAgentTypes_SystemPromptID_SystemPromptID UUID;
    p_MJAIAgentTypes_SystemPromptID_IsActive BOOLEAN;
    p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder VARCHAR(255);
    p_MJAIAgentTypes_SystemPromptID_DriverClass VARCHAR(255);
    p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey VARCHAR(500);
    p_MJAIAgentTypes_SystemPromptID_UIFormKey VARCHAR(500);
    p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault BOOLEAN;
    p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema TEXT;
    p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy TEXT;
    p_MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID UUID;
    p_MJAIAgents_ContextCompressionPromptIDID UUID;
    p_MJAIAgents_ContextCompressionPromptID_Name VARCHAR(255);
    p_MJAIAgents_ContextCompressionPromptID_Description TEXT;
    p_MJAIAgents_ContextCompressionPromptID_LogoURL VARCHAR(255);
    p_MJAIAgents_ContextCompressionPromptID_ParentID UUID;
    p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ExecutionMode VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508 BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d UUID;
    p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1 INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_TypeID UUID;
    p_MJAIAgents_ContextCompressionPromptID_Status VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_DriverClass VARCHAR(255);
    p_MJAIAgents_ContextCompressionPromptID_IconClass VARCHAR(100);
    p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode VARCHAR(50);
    p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadScope TEXT;
    p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation TEXT;
    p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211 VARCHAR(25);
    p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251 INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun NUMERIC(10,4);
    p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60 TEXT;
    p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_849b88 VARCHAR(25);
    p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203 INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption VARCHAR(30);
    p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID UUID;
    p_MJAIAgents_ContextCompressionPromptID_OwnerUserID UUID;
    p_MJAIAgents_ContextCompressionPromptID_InvocationMode VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements TEXT;
    p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign TEXT;
    p_MJAIAgents_ContextCompressionPromptID_InjectNotes BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_InjectExamples BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212 VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_IsRestricted BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_MessageMode VARCHAR(50);
    p_MJAIAgents_ContextCompressionPromptID_MaxMessages INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf UUID;
    p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath VARCHAR(500);
    p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams TEXT;
    p_MJAIAgents_ContextCompressionPromptID_ScopeConfig TEXT;
    p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration TEXT;
    p_MJAIAgents_ContextCompressionPromptID_CategoryID UUID;
    p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID UUID;
    p_MJAIAgents_ContextCompressionPromptID_SearchScopeAccess VARCHAR(20);
    p_MJAIConfigurations_DefaultPromptForContextCompressionIDID UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_Name VARCHAR(100);
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_da9038 TEXT;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_6adeb7 BOOLEAN;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_d74408 VARCHAR(20);
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_dbdd4d UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_30722a UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_70e3ed VARCHAR(500);
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_0dd4a4 UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarizationIDID UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_c5c467 VARCHAR(100);
    p_MJAIConfigurations_DefaultPromptForContextSummarization_6a1d29 TEXT;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_bf32c6 BOOLEAN;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_6fd740 VARCHAR(20);
    p_MJAIConfigurations_DefaultPromptForContextSummarization_ac095a UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_931872 UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_991e80 UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_b4211c VARCHAR(500);
    p_MJAIConfigurations_DefaultPromptForContextSummarization_ce7c84 UUID;
    p_MJAIPromptModels_PromptIDID UUID;
    p_MJAIPromptRuns_PromptIDID UUID;
    p_MJAIPromptRuns_JudgeIDID UUID;
    p_MJAIPromptRuns_JudgeID_PromptID UUID;
    p_MJAIPromptRuns_JudgeID_ModelID UUID;
    p_MJAIPromptRuns_JudgeID_VendorID UUID;
    p_MJAIPromptRuns_JudgeID_AgentID UUID;
    p_MJAIPromptRuns_JudgeID_ConfigurationID UUID;
    p_MJAIPromptRuns_JudgeID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_JudgeID_Messages TEXT;
    p_MJAIPromptRuns_JudgeID_Result TEXT;
    p_MJAIPromptRuns_JudgeID_TokensUsed INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_JudgeID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_JudgeID_Success BOOLEAN;
    p_MJAIPromptRuns_JudgeID_ErrorMessage TEXT;
    p_MJAIPromptRuns_JudgeID_ParentID UUID;
    p_MJAIPromptRuns_JudgeID_RunType VARCHAR(20);
    p_MJAIPromptRuns_JudgeID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_JudgeID_AgentRunID UUID;
    p_MJAIPromptRuns_JudgeID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_JudgeID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_JudgeID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_JudgeID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_TopK INTEGER;
    p_MJAIPromptRuns_JudgeID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_Seed INTEGER;
    p_MJAIPromptRuns_JudgeID_StopSequences TEXT;
    p_MJAIPromptRuns_JudgeID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_JudgeID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_JudgeID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_JudgeID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_JudgeID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_JudgeID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_JudgeID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_JudgeID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_JudgeID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_JudgeID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_JudgeID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_JudgeID_ValidationSummary TEXT;
    p_MJAIPromptRuns_JudgeID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_JudgeID_FailoverErrors TEXT;
    p_MJAIPromptRuns_JudgeID_FailoverDurations TEXT;
    p_MJAIPromptRuns_JudgeID_OriginalModelID UUID;
    p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_JudgeID_ModelSelection TEXT;
    p_MJAIPromptRuns_JudgeID_Status VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_JudgeID_CancellationReason TEXT;
    p_MJAIPromptRuns_JudgeID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_JudgeID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_JudgeID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_JudgeID_JudgeID UUID;
    p_MJAIPromptRuns_JudgeID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_JudgeID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_JudgeID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_JudgeID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_JudgeID_ErrorDetails TEXT;
    p_MJAIPromptRuns_JudgeID_ChildPromptID UUID;
    p_MJAIPromptRuns_JudgeID_QueueTime INTEGER;
    p_MJAIPromptRuns_JudgeID_PromptTime INTEGER;
    p_MJAIPromptRuns_JudgeID_CompletionTime INTEGER;
    p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_JudgeID_EffortLevel INTEGER;
    p_MJAIPromptRuns_JudgeID_RunName VARCHAR(255);
    p_MJAIPromptRuns_JudgeID_Comments TEXT;
    p_MJAIPromptRuns_JudgeID_TestRunID UUID;
    p_MJAIPromptRuns_JudgeID_AssistantPrefill TEXT;
    p_MJAIPromptRuns_ChildPromptIDID UUID;
    p_MJAIPromptRuns_ChildPromptID_PromptID UUID;
    p_MJAIPromptRuns_ChildPromptID_ModelID UUID;
    p_MJAIPromptRuns_ChildPromptID_VendorID UUID;
    p_MJAIPromptRuns_ChildPromptID_AgentID UUID;
    p_MJAIPromptRuns_ChildPromptID_ConfigurationID UUID;
    p_MJAIPromptRuns_ChildPromptID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_ChildPromptID_Messages TEXT;
    p_MJAIPromptRuns_ChildPromptID_Result TEXT;
    p_MJAIPromptRuns_ChildPromptID_TokensUsed INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_ChildPromptID_Success BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_ErrorMessage TEXT;
    p_MJAIPromptRuns_ChildPromptID_ParentID UUID;
    p_MJAIPromptRuns_ChildPromptID_RunType VARCHAR(20);
    p_MJAIPromptRuns_ChildPromptID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_ChildPromptID_AgentRunID UUID;
    p_MJAIPromptRuns_ChildPromptID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_ChildPromptID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_ChildPromptID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_TopK INTEGER;
    p_MJAIPromptRuns_ChildPromptID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_Seed INTEGER;
    p_MJAIPromptRuns_ChildPromptID_StopSequences TEXT;
    p_MJAIPromptRuns_ChildPromptID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_ChildPromptID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_ChildPromptID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_ChildPromptID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_ChildPromptID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_ChildPromptID_ValidationSummary TEXT;
    p_MJAIPromptRuns_ChildPromptID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_ChildPromptID_FailoverErrors TEXT;
    p_MJAIPromptRuns_ChildPromptID_FailoverDurations TEXT;
    p_MJAIPromptRuns_ChildPromptID_OriginalModelID UUID;
    p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_ChildPromptID_ModelSelection TEXT;
    p_MJAIPromptRuns_ChildPromptID_Status VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_CancellationReason TEXT;
    p_MJAIPromptRuns_ChildPromptID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_ChildPromptID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_ChildPromptID_JudgeID UUID;
    p_MJAIPromptRuns_ChildPromptID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_ChildPromptID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_ErrorDetails TEXT;
    p_MJAIPromptRuns_ChildPromptID_ChildPromptID UUID;
    p_MJAIPromptRuns_ChildPromptID_QueueTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_PromptTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_CompletionTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_ChildPromptID_EffortLevel INTEGER;
    p_MJAIPromptRuns_ChildPromptID_RunName VARCHAR(255);
    p_MJAIPromptRuns_ChildPromptID_Comments TEXT;
    p_MJAIPromptRuns_ChildPromptID_TestRunID UUID;
    p_MJAIPromptRuns_ChildPromptID_AssistantPrefill TEXT;
    p_MJAIPrompts_ResultSelectorPromptIDID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_Name VARCHAR(255);
    p_MJAIPrompts_ResultSelectorPromptID_Description TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_TemplateID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_CategoryID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_TypeID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_Status VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_ResponseFormat VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ModelSpecificRespons_905abd TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_AIModelTypeID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_MinPowerRank INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_SelectionStrategy VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_PowerPreference VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ParallelizationMode VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ParallelCount INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam VARCHAR(100);
    p_MJAIPrompts_ResultSelectorPromptID_OutputType VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_OutputExample TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_ValidationBehavior VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_MaxRetries INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_RetryDelayMS INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_RetryStrategy VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_EnableCaching BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMatchType VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold DOUBLE PRECISION;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_PromptRole VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_PromptPosition VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_Temperature NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_TopP NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_TopK INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_MinP NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_PresencePenalty NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_Seed INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_StopSequences VARCHAR(1000);
    p_MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_TopLogProbs INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_FailoverStrategy VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_EffortLevel INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_AssistantPrefill TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels BOOLEAN;
    p_MJAIResultCache_AIPromptIDID UUID;
BEGIN
-- Cascade update on Action using cursor to call spUpdateAction


    FOR _rec IN SELECT "ID", "CategoryID", "Name", "Description", "Type", "UserPrompt", "UserComments", "Code", "CodeComments", "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt", "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status", "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID", "Config", "RuntimeActionConfiguration", "MaxExecutionTimeMS", "CreatedByAgentID" FROM __mj."Action" WHERE "DefaultCompactPromptID" = p_ID
    LOOP
        p_MJActions_DefaultCompactPromptIDID := _rec."ID";
        p_MJActions_DefaultCompactPromptID_CategoryID := _rec."CategoryID";
        p_MJActions_DefaultCompactPromptID_Name := _rec."Name";
        p_MJActions_DefaultCompactPromptID_Description := _rec."Description";
        p_MJActions_DefaultCompactPromptID_Type := _rec."Type";
        p_MJActions_DefaultCompactPromptID_UserPrompt := _rec."UserPrompt";
        p_MJActions_DefaultCompactPromptID_UserComments := _rec."UserComments";
        p_MJActions_DefaultCompactPromptID_Code := _rec."Code";
        p_MJActions_DefaultCompactPromptID_CodeComments := _rec."CodeComments";
        p_MJActions_DefaultCompactPromptID_CodeApprovalStatus := _rec."CodeApprovalStatus";
        p_MJActions_DefaultCompactPromptID_CodeApprovalComments := _rec."CodeApprovalComments";
        p_MJActions_DefaultCompactPromptID_CodeApprovedByUserID := _rec."CodeApprovedByUserID";
        p_MJActions_DefaultCompactPromptID_CodeApprovedAt := _rec."CodeApprovedAt";
        p_MJActions_DefaultCompactPromptID_CodeLocked := _rec."CodeLocked";
        p_MJActions_DefaultCompactPromptID_ForceCodeGeneration := _rec."ForceCodeGeneration";
        p_MJActions_DefaultCompactPromptID_RetentionPeriod := _rec."RetentionPeriod";
        p_MJActions_DefaultCompactPromptID_Status := _rec."Status";
        p_MJActions_DefaultCompactPromptID_DriverClass := _rec."DriverClass";
        p_MJActions_DefaultCompactPromptID_ParentID := _rec."ParentID";
        p_MJActions_DefaultCompactPromptID_IconClass := _rec."IconClass";
        p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID := _rec."DefaultCompactPromptID";
        p_MJActions_DefaultCompactPromptID_Config := _rec."Config";
        p_MJActions_DefaultCompactPromptID_RuntimeActionConfiguration := _rec."RuntimeActionConfiguration";
        p_MJActions_DefaultCompactPromptID_MaxExecutionTimeMS := _rec."MaxExecutionTimeMS";
        p_MJActions_DefaultCompactPromptID_CreatedByAgentID := _rec."CreatedByAgentID";
        -- Set the FK field to NULL
        p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAction"(p_ID => p_MJActions_DefaultCompactPromptIDID, p_CategoryID => p_MJActions_DefaultCompactPromptID_CategoryID, p_Name => p_MJActions_DefaultCompactPromptID_Name, p_Description => p_MJActions_DefaultCompactPromptID_Description, p_Type => p_MJActions_DefaultCompactPromptID_Type, p_UserPrompt => p_MJActions_DefaultCompactPromptID_UserPrompt, p_UserComments => p_MJActions_DefaultCompactPromptID_UserComments, p_Code => p_MJActions_DefaultCompactPromptID_Code, p_CodeComments => p_MJActions_DefaultCompactPromptID_CodeComments, p_CodeApprovalStatus => p_MJActions_DefaultCompactPromptID_CodeApprovalStatus, p_CodeApprovalComments => p_MJActions_DefaultCompactPromptID_CodeApprovalComments, p_CodeApprovedByUserID => p_MJActions_DefaultCompactPromptID_CodeApprovedByUserID, p_CodeApprovedAt => p_MJActions_DefaultCompactPromptID_CodeApprovedAt, p_CodeLocked => p_MJActions_DefaultCompactPromptID_CodeLocked, p_ForceCodeGeneration => p_MJActions_DefaultCompactPromptID_ForceCodeGeneration, p_RetentionPeriod => p_MJActions_DefaultCompactPromptID_RetentionPeriod, p_Status => p_MJActions_DefaultCompactPromptID_Status, p_DriverClass => p_MJActions_DefaultCompactPromptID_DriverClass, p_ParentID => p_MJActions_DefaultCompactPromptID_ParentID, p_IconClass => p_MJActions_DefaultCompactPromptID_IconClass, p_DefaultCompactPromptID_Clear => 1, p_DefaultCompactPromptID => p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID, p_Config => p_MJActions_DefaultCompactPromptID_Config, p_RuntimeActionConfiguration => p_MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, p_MaxExecutionTimeMS => p_MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, p_CreatedByAgentID => p_MJActions_DefaultCompactPromptID_CreatedByAgentID);

    END LOOP;

    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction


    FOR _rec IN SELECT "ID", "AgentID", "ActionID", "Status", "MinExecutionsPerRun", "MaxExecutionsPerRun", "ResultExpirationTurns", "ResultExpirationMode", "CompactMode", "CompactLength", "CompactPromptID" FROM __mj."AIAgentAction" WHERE "CompactPromptID" = p_ID
    LOOP
        p_MJAIAgentActions_CompactPromptIDID := _rec."ID";
        p_MJAIAgentActions_CompactPromptID_AgentID := _rec."AgentID";
        p_MJAIAgentActions_CompactPromptID_ActionID := _rec."ActionID";
        p_MJAIAgentActions_CompactPromptID_Status := _rec."Status";
        p_MJAIAgentActions_CompactPromptID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgentActions_CompactPromptID_ResultExpirationTurns := _rec."ResultExpirationTurns";
        p_MJAIAgentActions_CompactPromptID_ResultExpirationMode := _rec."ResultExpirationMode";
        p_MJAIAgentActions_CompactPromptID_CompactMode := _rec."CompactMode";
        p_MJAIAgentActions_CompactPromptID_CompactLength := _rec."CompactLength";
        p_MJAIAgentActions_CompactPromptID_CompactPromptID := _rec."CompactPromptID";
        -- Set the FK field to NULL
        p_MJAIAgentActions_CompactPromptID_CompactPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentAction"(p_ID => p_MJAIAgentActions_CompactPromptIDID, p_AgentID => p_MJAIAgentActions_CompactPromptID_AgentID, p_ActionID => p_MJAIAgentActions_CompactPromptID_ActionID, p_Status => p_MJAIAgentActions_CompactPromptID_Status, p_MinExecutionsPerRun => p_MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, p_ResultExpirationTurns => p_MJAIAgentActions_CompactPromptID_ResultExpirationTurns, p_ResultExpirationMode => p_MJAIAgentActions_CompactPromptID_ResultExpirationMode, p_CompactMode => p_MJAIAgentActions_CompactPromptID_CompactMode, p_CompactLength => p_MJAIAgentActions_CompactPromptID_CompactLength, p_CompactPromptID_Clear => 1, p_CompactPromptID => p_MJAIAgentActions_CompactPromptID_CompactPromptID);

    END LOOP;

    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPrompt" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIAgentPrompts_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPrompt"(p_ID => p_MJAIAgentPrompts_PromptIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep


    FOR _rec IN SELECT "ID", "AgentID", "Name", "Description", "StepType", "StartingStep", "TimeoutSeconds", "RetryCount", "OnErrorBehavior", "ActionID", "SubAgentID", "PromptID", "ActionOutputMapping", "PositionX", "PositionY", "Width", "Height", "Status", "ActionInputMapping", "LoopBodyType", "Configuration" FROM __mj."AIAgentStep" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIAgentSteps_PromptIDID := _rec."ID";
        p_MJAIAgentSteps_PromptID_AgentID := _rec."AgentID";
        p_MJAIAgentSteps_PromptID_Name := _rec."Name";
        p_MJAIAgentSteps_PromptID_Description := _rec."Description";
        p_MJAIAgentSteps_PromptID_StepType := _rec."StepType";
        p_MJAIAgentSteps_PromptID_StartingStep := _rec."StartingStep";
        p_MJAIAgentSteps_PromptID_TimeoutSeconds := _rec."TimeoutSeconds";
        p_MJAIAgentSteps_PromptID_RetryCount := _rec."RetryCount";
        p_MJAIAgentSteps_PromptID_OnErrorBehavior := _rec."OnErrorBehavior";
        p_MJAIAgentSteps_PromptID_ActionID := _rec."ActionID";
        p_MJAIAgentSteps_PromptID_SubAgentID := _rec."SubAgentID";
        p_MJAIAgentSteps_PromptID_PromptID := _rec."PromptID";
        p_MJAIAgentSteps_PromptID_ActionOutputMapping := _rec."ActionOutputMapping";
        p_MJAIAgentSteps_PromptID_PositionX := _rec."PositionX";
        p_MJAIAgentSteps_PromptID_PositionY := _rec."PositionY";
        p_MJAIAgentSteps_PromptID_Width := _rec."Width";
        p_MJAIAgentSteps_PromptID_Height := _rec."Height";
        p_MJAIAgentSteps_PromptID_Status := _rec."Status";
        p_MJAIAgentSteps_PromptID_ActionInputMapping := _rec."ActionInputMapping";
        p_MJAIAgentSteps_PromptID_LoopBodyType := _rec."LoopBodyType";
        p_MJAIAgentSteps_PromptID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJAIAgentSteps_PromptID_PromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentStep"(p_ID => p_MJAIAgentSteps_PromptIDID, p_AgentID => p_MJAIAgentSteps_PromptID_AgentID, p_Name => p_MJAIAgentSteps_PromptID_Name, p_Description => p_MJAIAgentSteps_PromptID_Description, p_StepType => p_MJAIAgentSteps_PromptID_StepType, p_StartingStep => p_MJAIAgentSteps_PromptID_StartingStep, p_TimeoutSeconds => p_MJAIAgentSteps_PromptID_TimeoutSeconds, p_RetryCount => p_MJAIAgentSteps_PromptID_RetryCount, p_OnErrorBehavior => p_MJAIAgentSteps_PromptID_OnErrorBehavior, p_ActionID => p_MJAIAgentSteps_PromptID_ActionID, p_SubAgentID => p_MJAIAgentSteps_PromptID_SubAgentID, p_PromptID_Clear => 1, p_PromptID => p_MJAIAgentSteps_PromptID_PromptID, p_ActionOutputMapping => p_MJAIAgentSteps_PromptID_ActionOutputMapping, p_PositionX => p_MJAIAgentSteps_PromptID_PositionX, p_PositionY => p_MJAIAgentSteps_PromptID_PositionY, p_Width => p_MJAIAgentSteps_PromptID_Width, p_Height => p_MJAIAgentSteps_PromptID_Height, p_Status => p_MJAIAgentSteps_PromptID_Status, p_ActionInputMapping => p_MJAIAgentSteps_PromptID_ActionInputMapping, p_LoopBodyType => p_MJAIAgentSteps_PromptID_LoopBodyType, p_Configuration => p_MJAIAgentSteps_PromptID_Configuration);

    END LOOP;

    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType


    FOR _rec IN SELECT "ID", "Name", "Description", "SystemPromptID", "IsActive", "AgentPromptPlaceholder", "DriverClass", "UIFormSectionKey", "UIFormKey", "UIFormSectionExpandedByDefault", "PromptParamsSchema", "AssignmentStrategy", "DefaultStorageAccountID" FROM __mj."AIAgentType" WHERE "SystemPromptID" = p_ID
    LOOP
        p_MJAIAgentTypes_SystemPromptIDID := _rec."ID";
        p_MJAIAgentTypes_SystemPromptID_Name := _rec."Name";
        p_MJAIAgentTypes_SystemPromptID_Description := _rec."Description";
        p_MJAIAgentTypes_SystemPromptID_SystemPromptID := _rec."SystemPromptID";
        p_MJAIAgentTypes_SystemPromptID_IsActive := _rec."IsActive";
        p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder := _rec."AgentPromptPlaceholder";
        p_MJAIAgentTypes_SystemPromptID_DriverClass := _rec."DriverClass";
        p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey := _rec."UIFormSectionKey";
        p_MJAIAgentTypes_SystemPromptID_UIFormKey := _rec."UIFormKey";
        p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault := _rec."UIFormSectionExpandedByDefault";
        p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema := _rec."PromptParamsSchema";
        p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy := _rec."AssignmentStrategy";
        p_MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID := _rec."DefaultStorageAccountID";
        -- Set the FK field to NULL
        p_MJAIAgentTypes_SystemPromptID_SystemPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentType"(p_ID => p_MJAIAgentTypes_SystemPromptIDID, p_Name => p_MJAIAgentTypes_SystemPromptID_Name, p_Description => p_MJAIAgentTypes_SystemPromptID_Description, p_SystemPromptID_Clear => 1, p_SystemPromptID => p_MJAIAgentTypes_SystemPromptID_SystemPromptID, p_IsActive => p_MJAIAgentTypes_SystemPromptID_IsActive, p_AgentPromptPlaceholder => p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, p_DriverClass => p_MJAIAgentTypes_SystemPromptID_DriverClass, p_UIFormSectionKey => p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey, p_UIFormKey => p_MJAIAgentTypes_SystemPromptID_UIFormKey, p_UIFormSectionExpandedByDefault => p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, p_PromptParamsSchema => p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema, p_AssignmentStrategy => p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy, p_DefaultStorageAccountID => p_MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess" FROM __mj."AIAgent" WHERE "ContextCompressionPromptID" = p_ID
    LOOP
        p_MJAIAgents_ContextCompressionPromptIDID := _rec."ID";
        p_MJAIAgents_ContextCompressionPromptID_Name := _rec."Name";
        p_MJAIAgents_ContextCompressionPromptID_Description := _rec."Description";
        p_MJAIAgents_ContextCompressionPromptID_LogoURL := _rec."LogoURL";
        p_MJAIAgents_ContextCompressionPromptID_ParentID := _rec."ParentID";
        p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction := _rec."ExposeAsAction";
        p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIAgents_ContextCompressionPromptID_ExecutionMode := _rec."ExecutionMode";
        p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508 := _rec."EnableContextCompression";
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d := _rec."ContextCompressionPromptID";
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1 := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgents_ContextCompressionPromptID_TypeID := _rec."TypeID";
        p_MJAIAgents_ContextCompressionPromptID_Status := _rec."Status";
        p_MJAIAgents_ContextCompressionPromptID_DriverClass := _rec."DriverClass";
        p_MJAIAgents_ContextCompressionPromptID_IconClass := _rec."IconClass";
        p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode := _rec."ModelSelectionMode";
        p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths := _rec."PayloadDownstreamPaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths := _rec."PayloadUpstreamPaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths := _rec."PayloadSelfReadPaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths := _rec."PayloadSelfWritePaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadScope := _rec."PayloadScope";
        p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation := _rec."FinalPayloadValidation";
        p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211 := _rec."FinalPayloadValidationMode";
        p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251 := _rec."FinalPayloadValidationMaxRetries";
        p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun := _rec."MaxCostPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun := _rec."MaxTokensPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun := _rec."MaxIterationsPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun := _rec."MaxTimePerRun";
        p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60 := _rec."StartingPayloadValidation";
        p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60Mode := _rec."StartingPayloadValidationMode";
        p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203 := _rec."DefaultPromptEffortLevel";
        p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption := _rec."ChatHandlingOption";
        p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID := _rec."DefaultArtifactTypeID";
        p_MJAIAgents_ContextCompressionPromptID_OwnerUserID := _rec."OwnerUserID";
        p_MJAIAgents_ContextCompressionPromptID_InvocationMode := _rec."InvocationMode";
        p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode := _rec."ArtifactCreationMode";
        p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements := _rec."FunctionalRequirements";
        p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign := _rec."TechnicalDesign";
        p_MJAIAgents_ContextCompressionPromptID_InjectNotes := _rec."InjectNotes";
        p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject := _rec."MaxNotesToInject";
        p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy := _rec."NoteInjectionStrategy";
        p_MJAIAgents_ContextCompressionPromptID_InjectExamples := _rec."InjectExamples";
        p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject := _rec."MaxExamplesToInject";
        p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212 := _rec."ExampleInjectionStrategy";
        p_MJAIAgents_ContextCompressionPromptID_IsRestricted := _rec."IsRestricted";
        p_MJAIAgents_ContextCompressionPromptID_MessageMode := _rec."MessageMode";
        p_MJAIAgents_ContextCompressionPromptID_MaxMessages := _rec."MaxMessages";
        p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf := _rec."AttachmentStorageProviderID";
        p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath := _rec."AttachmentRootPath";
        p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef := _rec."InlineStorageThresholdBytes";
        p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams := _rec."AgentTypePromptParams";
        p_MJAIAgents_ContextCompressionPromptID_ScopeConfig := _rec."ScopeConfig";
        p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays := _rec."NoteRetentionDays";
        p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays := _rec."ExampleRetentionDays";
        p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled := _rec."AutoArchiveEnabled";
        p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration := _rec."RerankerConfiguration";
        p_MJAIAgents_ContextCompressionPromptID_CategoryID := _rec."CategoryID";
        p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b := _rec."AllowEphemeralClientTools";
        p_MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID := _rec."DefaultStorageAccountID";
        p_MJAIAgents_ContextCompressionPromptID_SearchScopeAccess := _rec."SearchScopeAccess";
        -- Set the FK field to NULL
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ContextCompressionPromptIDID, p_Name => p_MJAIAgents_ContextCompressionPromptID_Name, p_Description => p_MJAIAgents_ContextCompressionPromptID_Description, p_LogoURL => p_MJAIAgents_ContextCompressionPromptID_LogoURL, p_ParentID => p_MJAIAgents_ContextCompressionPromptID_ParentID, p_ExposeAsAction => p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ContextCompressionPromptID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508, p_ContextCompressionMessageThreshold => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d, p_ContextCompressionPromptID_Clear => 1, p_ContextCompressionPromptID => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1, p_TypeID => p_MJAIAgents_ContextCompressionPromptID_TypeID, p_Status => p_MJAIAgents_ContextCompressionPromptID_Status, p_DriverClass => p_MJAIAgents_ContextCompressionPromptID_DriverClass, p_IconClass => p_MJAIAgents_ContextCompressionPromptID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ContextCompressionPromptID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251, p_MaxCostPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60, p_StartingPayloadValidationMode => p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60Mode, p_DefaultPromptEffortLevel => p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203, p_ChatHandlingOption => p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ContextCompressionPromptID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ContextCompressionPromptID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ContextCompressionPromptID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ContextCompressionPromptID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212, p_IsRestricted => p_MJAIAgents_ContextCompressionPromptID_IsRestricted, p_MessageMode => p_MJAIAgents_ContextCompressionPromptID_MessageMode, p_MaxMessages => p_MJAIAgents_ContextCompressionPromptID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf, p_AttachmentRootPath => p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef, p_AgentTypePromptParams => p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ContextCompressionPromptID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ContextCompressionPromptID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b, p_DefaultStorageAccountID => p_MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_ContextCompressionPromptID_SearchScopeAccess);

    END LOOP;

    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration


    FOR _rec IN SELECT "ID", "Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID" FROM __mj."AIConfiguration" WHERE "DefaultPromptForContextCompressionID" = p_ID
    LOOP
        p_MJAIConfigurations_DefaultPromptForContextCompressionIDID := _rec."ID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_Name := _rec."Name";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_da9038 := _rec."Description";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_6adeb7 := _rec."IsDefault";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_d74408 := _rec."Status";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c := _rec."DefaultPromptForContextCompressionID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_dbdd4d := _rec."DefaultPromptForContextSummarizationID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_30722a := _rec."DefaultStorageProviderID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_70e3ed := _rec."DefaultStorageRootPath";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_0dd4a4 := _rec."ParentID";
        -- Set the FK field to NULL
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIConfiguration"(p_ID => p_MJAIConfigurations_DefaultPromptForContextCompressionIDID, p_Name => p_MJAIConfigurations_DefaultPromptForContextCompressionID_Name, p_Description => p_MJAIConfigurations_DefaultPromptForContextCompressionID_da9038, p_IsDefault => p_MJAIConfigurations_DefaultPromptForContextCompressionID_6adeb7, p_Status => p_MJAIConfigurations_DefaultPromptForContextCompressionID_d74408, p_DefaultPromptForContextCompressionID_Clear => 1, p_DefaultPromptForContextCompressionID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c, p_DefaultPromptForContextSummarizationID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_dbdd4d, p_DefaultStorageProviderID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_30722a, p_DefaultStorageRootPath => p_MJAIConfigurations_DefaultPromptForContextCompressionID_70e3ed, p_ParentID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_0dd4a4);

    END LOOP;

    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration


    FOR _rec IN SELECT "ID", "Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID" FROM __mj."AIConfiguration" WHERE "DefaultPromptForContextSummarizationID" = p_ID
    LOOP
        p_MJAIConfigurations_DefaultPromptForContextSummarizationIDID := _rec."ID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_c5c467 := _rec."Name";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_6a1d29 := _rec."Description";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_bf32c6 := _rec."IsDefault";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_6fd740 := _rec."Status";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_ac095a := _rec."DefaultPromptForContextCompressionID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_931872 := _rec."DefaultPromptForContextSummarizationID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_991e80 := _rec."DefaultStorageProviderID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_b4211c := _rec."DefaultStorageRootPath";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_ce7c84 := _rec."ParentID";
        -- Set the FK field to NULL
        p_MJAIConfigurations_DefaultPromptForContextSummarization_931872 := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIConfiguration"(p_ID => p_MJAIConfigurations_DefaultPromptForContextSummarizationIDID, p_Name => p_MJAIConfigurations_DefaultPromptForContextSummarization_c5c467, p_Description => p_MJAIConfigurations_DefaultPromptForContextSummarization_6a1d29, p_IsDefault => p_MJAIConfigurations_DefaultPromptForContextSummarization_bf32c6, p_Status => p_MJAIConfigurations_DefaultPromptForContextSummarization_6fd740, p_DefaultPromptForContextCompressionID => p_MJAIConfigurations_DefaultPromptForContextSummarization_ac095a, p_DefaultPromptForContextSummarizationID_Clear => 1, p_DefaultPromptForContextSummarizationID => p_MJAIConfigurations_DefaultPromptForContextSummarization_931872, p_DefaultStorageProviderID => p_MJAIConfigurations_DefaultPromptForContextSummarization_991e80, p_DefaultStorageRootPath => p_MJAIConfigurations_DefaultPromptForContextSummarization_b4211c, p_ParentID => p_MJAIConfigurations_DefaultPromptForContextSummarization_ce7c84);

    END LOOP;

    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptModel" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIPromptModels_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptModel"(p_ID => p_MJAIPromptModels_PromptIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptRun" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIPromptRuns_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptRun"(p_ID => p_MJAIPromptRuns_PromptIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "JudgeID" = p_ID
    LOOP
        p_MJAIPromptRuns_JudgeIDID := _rec."ID";
        p_MJAIPromptRuns_JudgeID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_JudgeID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_JudgeID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_JudgeID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_JudgeID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_JudgeID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_JudgeID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_JudgeID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_JudgeID_Messages := _rec."Messages";
        p_MJAIPromptRuns_JudgeID_Result := _rec."Result";
        p_MJAIPromptRuns_JudgeID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_JudgeID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_JudgeID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_JudgeID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_JudgeID_Success := _rec."Success";
        p_MJAIPromptRuns_JudgeID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_JudgeID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_JudgeID_RunType := _rec."RunType";
        p_MJAIPromptRuns_JudgeID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_JudgeID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_JudgeID_Cost := _rec."Cost";
        p_MJAIPromptRuns_JudgeID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_JudgeID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_JudgeID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_JudgeID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_JudgeID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_JudgeID_TopP := _rec."TopP";
        p_MJAIPromptRuns_JudgeID_TopK := _rec."TopK";
        p_MJAIPromptRuns_JudgeID_MinP := _rec."MinP";
        p_MJAIPromptRuns_JudgeID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_JudgeID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_JudgeID_Seed := _rec."Seed";
        p_MJAIPromptRuns_JudgeID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_JudgeID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_JudgeID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_JudgeID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_JudgeID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_JudgeID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_JudgeID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_JudgeID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_JudgeID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_JudgeID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_JudgeID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_JudgeID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_JudgeID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_JudgeID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_JudgeID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_JudgeID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_JudgeID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_JudgeID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_JudgeID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_JudgeID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_JudgeID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_JudgeID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_JudgeID_Status := _rec."Status";
        p_MJAIPromptRuns_JudgeID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_JudgeID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_JudgeID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_JudgeID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_JudgeID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_JudgeID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_JudgeID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_JudgeID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_JudgeID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_JudgeID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_JudgeID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_JudgeID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_JudgeID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_JudgeID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_JudgeID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_JudgeID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_JudgeID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_JudgeID_RunName := _rec."RunName";
        p_MJAIPromptRuns_JudgeID_Comments := _rec."Comments";
        p_MJAIPromptRuns_JudgeID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_JudgeID_AssistantPrefill := _rec."AssistantPrefill";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_JudgeID_JudgeID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_JudgeIDID, p_PromptID => p_MJAIPromptRuns_JudgeID_PromptID, p_ModelID => p_MJAIPromptRuns_JudgeID_ModelID, p_VendorID => p_MJAIPromptRuns_JudgeID_VendorID, p_AgentID => p_MJAIPromptRuns_JudgeID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_JudgeID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_JudgeID_RunAt, p_CompletedAt => p_MJAIPromptRuns_JudgeID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_JudgeID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_JudgeID_Messages, p_Result => p_MJAIPromptRuns_JudgeID_Result, p_TokensUsed => p_MJAIPromptRuns_JudgeID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_JudgeID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_JudgeID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_JudgeID_TotalCost, p_Success => p_MJAIPromptRuns_JudgeID_Success, p_ErrorMessage => p_MJAIPromptRuns_JudgeID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_JudgeID_ParentID, p_RunType => p_MJAIPromptRuns_JudgeID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_JudgeID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_JudgeID_AgentRunID, p_Cost => p_MJAIPromptRuns_JudgeID_Cost, p_CostCurrency => p_MJAIPromptRuns_JudgeID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_JudgeID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_JudgeID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_JudgeID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_JudgeID_Temperature, p_TopP => p_MJAIPromptRuns_JudgeID_TopP, p_TopK => p_MJAIPromptRuns_JudgeID_TopK, p_MinP => p_MJAIPromptRuns_JudgeID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_JudgeID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_JudgeID_PresencePenalty, p_Seed => p_MJAIPromptRuns_JudgeID_Seed, p_StopSequences => p_MJAIPromptRuns_JudgeID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_JudgeID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_JudgeID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_JudgeID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_JudgeID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_JudgeID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_JudgeID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_JudgeID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_JudgeID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_JudgeID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_JudgeID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_JudgeID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_JudgeID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_JudgeID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_JudgeID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_JudgeID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_JudgeID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_JudgeID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_JudgeID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_JudgeID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_JudgeID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_JudgeID_ModelSelection, p_Status => p_MJAIPromptRuns_JudgeID_Status, p_Cancelled => p_MJAIPromptRuns_JudgeID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_JudgeID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_JudgeID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_JudgeID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_JudgeID_CacheHit, p_CacheKey => p_MJAIPromptRuns_JudgeID_CacheKey, p_JudgeID_Clear => 1, p_JudgeID => p_MJAIPromptRuns_JudgeID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_JudgeID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_JudgeID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_JudgeID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_JudgeID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_JudgeID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_JudgeID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_JudgeID_QueueTime, p_PromptTime => p_MJAIPromptRuns_JudgeID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_JudgeID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_JudgeID_EffortLevel, p_RunName => p_MJAIPromptRuns_JudgeID_RunName, p_Comments => p_MJAIPromptRuns_JudgeID_Comments, p_TestRunID => p_MJAIPromptRuns_JudgeID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_JudgeID_AssistantPrefill);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "ChildPromptID" = p_ID
    LOOP
        p_MJAIPromptRuns_ChildPromptIDID := _rec."ID";
        p_MJAIPromptRuns_ChildPromptID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_ChildPromptID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_ChildPromptID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_ChildPromptID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_ChildPromptID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_ChildPromptID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_ChildPromptID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_ChildPromptID_Messages := _rec."Messages";
        p_MJAIPromptRuns_ChildPromptID_Result := _rec."Result";
        p_MJAIPromptRuns_ChildPromptID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_ChildPromptID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_ChildPromptID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_ChildPromptID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_ChildPromptID_Success := _rec."Success";
        p_MJAIPromptRuns_ChildPromptID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_ChildPromptID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_ChildPromptID_RunType := _rec."RunType";
        p_MJAIPromptRuns_ChildPromptID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_ChildPromptID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_ChildPromptID_Cost := _rec."Cost";
        p_MJAIPromptRuns_ChildPromptID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_ChildPromptID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_ChildPromptID_TopP := _rec."TopP";
        p_MJAIPromptRuns_ChildPromptID_TopK := _rec."TopK";
        p_MJAIPromptRuns_ChildPromptID_MinP := _rec."MinP";
        p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_ChildPromptID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_ChildPromptID_Seed := _rec."Seed";
        p_MJAIPromptRuns_ChildPromptID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_ChildPromptID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_ChildPromptID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_ChildPromptID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_ChildPromptID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_ChildPromptID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_ChildPromptID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_ChildPromptID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_ChildPromptID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_ChildPromptID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_ChildPromptID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_ChildPromptID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_ChildPromptID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_ChildPromptID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_ChildPromptID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_ChildPromptID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_ChildPromptID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_ChildPromptID_Status := _rec."Status";
        p_MJAIPromptRuns_ChildPromptID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_ChildPromptID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_ChildPromptID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_ChildPromptID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_ChildPromptID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_ChildPromptID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_ChildPromptID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_ChildPromptID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_ChildPromptID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_ChildPromptID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_ChildPromptID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_ChildPromptID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_ChildPromptID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_ChildPromptID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_ChildPromptID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_ChildPromptID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_ChildPromptID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_ChildPromptID_RunName := _rec."RunName";
        p_MJAIPromptRuns_ChildPromptID_Comments := _rec."Comments";
        p_MJAIPromptRuns_ChildPromptID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_ChildPromptID_AssistantPrefill := _rec."AssistantPrefill";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ChildPromptID_ChildPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ChildPromptIDID, p_PromptID => p_MJAIPromptRuns_ChildPromptID_PromptID, p_ModelID => p_MJAIPromptRuns_ChildPromptID_ModelID, p_VendorID => p_MJAIPromptRuns_ChildPromptID_VendorID, p_AgentID => p_MJAIPromptRuns_ChildPromptID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_ChildPromptID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ChildPromptID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ChildPromptID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ChildPromptID_Messages, p_Result => p_MJAIPromptRuns_ChildPromptID_Result, p_TokensUsed => p_MJAIPromptRuns_ChildPromptID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ChildPromptID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ChildPromptID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ChildPromptID_TotalCost, p_Success => p_MJAIPromptRuns_ChildPromptID_Success, p_ErrorMessage => p_MJAIPromptRuns_ChildPromptID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_ChildPromptID_ParentID, p_RunType => p_MJAIPromptRuns_ChildPromptID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ChildPromptID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_ChildPromptID_AgentRunID, p_Cost => p_MJAIPromptRuns_ChildPromptID_Cost, p_CostCurrency => p_MJAIPromptRuns_ChildPromptID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ChildPromptID_Temperature, p_TopP => p_MJAIPromptRuns_ChildPromptID_TopP, p_TopK => p_MJAIPromptRuns_ChildPromptID_TopK, p_MinP => p_MJAIPromptRuns_ChildPromptID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ChildPromptID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ChildPromptID_Seed, p_StopSequences => p_MJAIPromptRuns_ChildPromptID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ChildPromptID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ChildPromptID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ChildPromptID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ChildPromptID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ChildPromptID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ChildPromptID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ChildPromptID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ChildPromptID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ChildPromptID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ChildPromptID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ChildPromptID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ChildPromptID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ChildPromptID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ChildPromptID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ChildPromptID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ChildPromptID_ModelSelection, p_Status => p_MJAIPromptRuns_ChildPromptID_Status, p_Cancelled => p_MJAIPromptRuns_ChildPromptID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ChildPromptID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ChildPromptID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ChildPromptID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ChildPromptID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ChildPromptID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ChildPromptID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ChildPromptID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ChildPromptID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ChildPromptID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ChildPromptID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ChildPromptID_ErrorDetails, p_ChildPromptID_Clear => 1, p_ChildPromptID => p_MJAIPromptRuns_ChildPromptID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ChildPromptID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ChildPromptID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ChildPromptID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ChildPromptID_EffortLevel, p_RunName => p_MJAIPromptRuns_ChildPromptID_RunName, p_Comments => p_MJAIPromptRuns_ChildPromptID_Comments, p_TestRunID => p_MJAIPromptRuns_ChildPromptID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ChildPromptID_AssistantPrefill);

    END LOOP;

    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt


    FOR _rec IN SELECT "ID", "Name", "Description", "TemplateID", "CategoryID", "TypeID", "Status", "ResponseFormat", "ModelSpecificResponseFormat", "AIModelTypeID", "MinPowerRank", "SelectionStrategy", "PowerPreference", "ParallelizationMode", "ParallelCount", "ParallelConfigParam", "OutputType", "OutputExample", "ValidationBehavior", "MaxRetries", "RetryDelayMS", "RetryStrategy", "ResultSelectorPromptID", "EnableCaching", "CacheTTLSeconds", "CacheMatchType", "CacheSimilarityThreshold", "CacheMustMatchModel", "CacheMustMatchVendor", "CacheMustMatchAgent", "CacheMustMatchConfig", "PromptRole", "PromptPosition", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "IncludeLogProbs", "TopLogProbs", "FailoverStrategy", "FailoverMaxAttempts", "FailoverDelaySeconds", "FailoverModelStrategy", "FailoverErrorScope", "EffortLevel", "AssistantPrefill", "PrefillFallbackMode", "RequireSpecificModels" FROM __mj."AIPrompt" WHERE "ResultSelectorPromptID" = p_ID
    LOOP
        p_MJAIPrompts_ResultSelectorPromptIDID := _rec."ID";
        p_MJAIPrompts_ResultSelectorPromptID_Name := _rec."Name";
        p_MJAIPrompts_ResultSelectorPromptID_Description := _rec."Description";
        p_MJAIPrompts_ResultSelectorPromptID_TemplateID := _rec."TemplateID";
        p_MJAIPrompts_ResultSelectorPromptID_CategoryID := _rec."CategoryID";
        p_MJAIPrompts_ResultSelectorPromptID_TypeID := _rec."TypeID";
        p_MJAIPrompts_ResultSelectorPromptID_Status := _rec."Status";
        p_MJAIPrompts_ResultSelectorPromptID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPrompts_ResultSelectorPromptID_ModelSpecificRespons_905abd := _rec."ModelSpecificResponseFormat";
        p_MJAIPrompts_ResultSelectorPromptID_AIModelTypeID := _rec."AIModelTypeID";
        p_MJAIPrompts_ResultSelectorPromptID_MinPowerRank := _rec."MinPowerRank";
        p_MJAIPrompts_ResultSelectorPromptID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_PowerPreference := _rec."PowerPreference";
        p_MJAIPrompts_ResultSelectorPromptID_ParallelizationMode := _rec."ParallelizationMode";
        p_MJAIPrompts_ResultSelectorPromptID_ParallelCount := _rec."ParallelCount";
        p_MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam := _rec."ParallelConfigParam";
        p_MJAIPrompts_ResultSelectorPromptID_OutputType := _rec."OutputType";
        p_MJAIPrompts_ResultSelectorPromptID_OutputExample := _rec."OutputExample";
        p_MJAIPrompts_ResultSelectorPromptID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPrompts_ResultSelectorPromptID_MaxRetries := _rec."MaxRetries";
        p_MJAIPrompts_ResultSelectorPromptID_RetryDelayMS := _rec."RetryDelayMS";
        p_MJAIPrompts_ResultSelectorPromptID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID := _rec."ResultSelectorPromptID";
        p_MJAIPrompts_ResultSelectorPromptID_EnableCaching := _rec."EnableCaching";
        p_MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds := _rec."CacheTTLSeconds";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMatchType := _rec."CacheMatchType";
        p_MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold := _rec."CacheSimilarityThreshold";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel := _rec."CacheMustMatchModel";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor := _rec."CacheMustMatchVendor";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent := _rec."CacheMustMatchAgent";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig := _rec."CacheMustMatchConfig";
        p_MJAIPrompts_ResultSelectorPromptID_PromptRole := _rec."PromptRole";
        p_MJAIPrompts_ResultSelectorPromptID_PromptPosition := _rec."PromptPosition";
        p_MJAIPrompts_ResultSelectorPromptID_Temperature := _rec."Temperature";
        p_MJAIPrompts_ResultSelectorPromptID_TopP := _rec."TopP";
        p_MJAIPrompts_ResultSelectorPromptID_TopK := _rec."TopK";
        p_MJAIPrompts_ResultSelectorPromptID_MinP := _rec."MinP";
        p_MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPrompts_ResultSelectorPromptID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPrompts_ResultSelectorPromptID_Seed := _rec."Seed";
        p_MJAIPrompts_ResultSelectorPromptID_StopSequences := _rec."StopSequences";
        p_MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs := _rec."IncludeLogProbs";
        p_MJAIPrompts_ResultSelectorPromptID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverStrategy := _rec."FailoverStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts := _rec."FailoverMaxAttempts";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds := _rec."FailoverDelaySeconds";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy := _rec."FailoverModelStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope := _rec."FailoverErrorScope";
        p_MJAIPrompts_ResultSelectorPromptID_EffortLevel := _rec."EffortLevel";
        p_MJAIPrompts_ResultSelectorPromptID_AssistantPrefill := _rec."AssistantPrefill";
        p_MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode := _rec."PrefillFallbackMode";
        p_MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels := _rec."RequireSpecificModels";
        -- Set the FK field to NULL
        p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPrompt"(p_ID => p_MJAIPrompts_ResultSelectorPromptIDID, p_Name => p_MJAIPrompts_ResultSelectorPromptID_Name, p_Description => p_MJAIPrompts_ResultSelectorPromptID_Description, p_TemplateID => p_MJAIPrompts_ResultSelectorPromptID_TemplateID, p_CategoryID => p_MJAIPrompts_ResultSelectorPromptID_CategoryID, p_TypeID => p_MJAIPrompts_ResultSelectorPromptID_TypeID, p_Status => p_MJAIPrompts_ResultSelectorPromptID_Status, p_ResponseFormat => p_MJAIPrompts_ResultSelectorPromptID_ResponseFormat, p_ModelSpecificResponseFormat => p_MJAIPrompts_ResultSelectorPromptID_ModelSpecificRespons_905abd, p_AIModelTypeID => p_MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, p_MinPowerRank => p_MJAIPrompts_ResultSelectorPromptID_MinPowerRank, p_SelectionStrategy => p_MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, p_PowerPreference => p_MJAIPrompts_ResultSelectorPromptID_PowerPreference, p_ParallelizationMode => p_MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, p_ParallelCount => p_MJAIPrompts_ResultSelectorPromptID_ParallelCount, p_ParallelConfigParam => p_MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, p_OutputType => p_MJAIPrompts_ResultSelectorPromptID_OutputType, p_OutputExample => p_MJAIPrompts_ResultSelectorPromptID_OutputExample, p_ValidationBehavior => p_MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, p_MaxRetries => p_MJAIPrompts_ResultSelectorPromptID_MaxRetries, p_RetryDelayMS => p_MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, p_RetryStrategy => p_MJAIPrompts_ResultSelectorPromptID_RetryStrategy, p_ResultSelectorPromptID_Clear => 1, p_ResultSelectorPromptID => p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, p_EnableCaching => p_MJAIPrompts_ResultSelectorPromptID_EnableCaching, p_CacheTTLSeconds => p_MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, p_CacheMatchType => p_MJAIPrompts_ResultSelectorPromptID_CacheMatchType, p_CacheSimilarityThreshold => p_MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, p_CacheMustMatchModel => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, p_CacheMustMatchVendor => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, p_CacheMustMatchAgent => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, p_CacheMustMatchConfig => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, p_PromptRole => p_MJAIPrompts_ResultSelectorPromptID_PromptRole, p_PromptPosition => p_MJAIPrompts_ResultSelectorPromptID_PromptPosition, p_Temperature => p_MJAIPrompts_ResultSelectorPromptID_Temperature, p_TopP => p_MJAIPrompts_ResultSelectorPromptID_TopP, p_TopK => p_MJAIPrompts_ResultSelectorPromptID_TopK, p_MinP => p_MJAIPrompts_ResultSelectorPromptID_MinP, p_FrequencyPenalty => p_MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, p_PresencePenalty => p_MJAIPrompts_ResultSelectorPromptID_PresencePenalty, p_Seed => p_MJAIPrompts_ResultSelectorPromptID_Seed, p_StopSequences => p_MJAIPrompts_ResultSelectorPromptID_StopSequences, p_IncludeLogProbs => p_MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, p_TopLogProbs => p_MJAIPrompts_ResultSelectorPromptID_TopLogProbs, p_FailoverStrategy => p_MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, p_FailoverMaxAttempts => p_MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, p_FailoverDelaySeconds => p_MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, p_FailoverModelStrategy => p_MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, p_FailoverErrorScope => p_MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, p_EffortLevel => p_MJAIPrompts_ResultSelectorPromptID_EffortLevel, p_AssistantPrefill => p_MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, p_PrefillFallbackMode => p_MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, p_RequireSpecificModels => p_MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels);

    END LOOP;

    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache

    FOR _rec IN SELECT "ID" FROM __mj."AIResultCache" WHERE "AIPromptID" = p_ID
    LOOP
        p_MJAIResultCache_AIPromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIResultCache"(p_ID => p_MJAIResultCache_AIPromptIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."AIPrompt"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentSearchScope_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentSearchScope" ON __mj."AIAgentSearchScope";
CREATE TRIGGER "trgUpdateAIAgentSearchScope"
    BEFORE UPDATE ON __mj."AIAgentSearchScope"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentSearchScope_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSearchExecutionLog_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSearchExecutionLog" ON __mj."SearchExecutionLog";
CREATE TRIGGER "trgUpdateSearchExecutionLog"
    BEFORE UPDATE ON __mj."SearchExecutionLog"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSearchExecutionLog_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSearchScopeExternalIndex_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSearchScopeExternalIndex" ON __mj."SearchScopeExternalIndex";
CREATE TRIGGER "trgUpdateSearchScopeExternalIndex"
    BEFORE UPDATE ON __mj."SearchScopeExternalIndex"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSearchScopeExternalIndex_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSearchScopeEntity_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSearchScopeEntity" ON __mj."SearchScopeEntity";
CREATE TRIGGER "trgUpdateSearchScopeEntity"
    BEFORE UPDATE ON __mj."SearchScopeEntity"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSearchScopeEntity_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSearchScopeProvider_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSearchScopeProvider" ON __mj."SearchScopeProvider";
CREATE TRIGGER "trgUpdateSearchScopeProvider"
    BEFORE UPDATE ON __mj."SearchScopeProvider"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSearchScopeProvider_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSearchScopePermission_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSearchScopePermission" ON __mj."SearchScopePermission";
CREATE TRIGGER "trgUpdateSearchScopePermission"
    BEFORE UPDATE ON __mj."SearchScopePermission"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSearchScopePermission_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSearchScope_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSearchScope" ON __mj."SearchScope";
CREATE TRIGGER "trgUpdateSearchScope"
    BEFORE UPDATE ON __mj."SearchScope"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSearchScope_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSearchScopeTestQuery_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSearchScopeTestQuery" ON __mj."SearchScopeTestQuery";
CREATE TRIGGER "trgUpdateSearchScopeTestQuery"
    BEFORE UPDATE ON __mj."SearchScopeTestQuery"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSearchScopeTestQuery_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSearchScopeStorageAccount_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSearchScopeStorageAccount" ON __mj."SearchScopeStorageAccount";
CREATE TRIGGER "trgUpdateSearchScopeStorageAccount"
    BEFORE UPDATE ON __mj."SearchScopeStorageAccount"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSearchScopeStorageAccount_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgent_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgent" ON __mj."AIAgent";
CREATE TRIGGER "trgUpdateAIAgent"
    BEFORE UPDATE ON __mj."AIAgent"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgent_func"();


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
         '3f83c084-859f-49c3-a8a0-4693e0777be8',
         'MJ: Search Scopes',
         'Search Scopes',
         'A named, reusable boundary defining WHICH content participates in a search (providers, external indexes, entities, storage accounts). Combined with a runtime SearchContext, it enables multi-tenant, permission-aware, agent-friendly retrieval. See plans/search-scopes-rag-plus.md.',
         NULL,
         'SearchScope',
         'vwSearchScopes',
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

/* SQL generated to add new entity MJ: Search Scopes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3f83c084-859f-49c3-a8a0-4693e0777be8', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scopes for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3f83c084-859f-49c3-a8a0-4693e0777be8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scopes for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3f83c084-859f-49c3-a8a0-4693e0777be8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scopes for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3f83c084-859f-49c3-a8a0-4693e0777be8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Search Scope Providers */

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
         '211dd116-32c7-43b4-b147-418f76b0e0e3',
         'MJ: Search Scope Providers',
         'Search Scope Providers',
         'Controls which SearchProviders participate in a given SearchScope. Each row enables one provider within one scope, with optional overrides.',
         NULL,
         'SearchScopeProvider',
         'vwSearchScopeProviders',
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

/* SQL generated to add new entity MJ: Search Scope Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '211dd116-32c7-43b4-b147-418f76b0e0e3', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Providers for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('211dd116-32c7-43b4-b147-418f76b0e0e3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Providers for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('211dd116-32c7-43b4-b147-418f76b0e0e3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Providers for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('211dd116-32c7-43b4-b147-418f76b0e0e3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Search Scope External Indexes */

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
         '3b80a286-d1e1-45c2-9648-c850009e1adb',
         'MJ: Search Scope External Indexes',
         'Search Scope External Indexes',
         'Scoped external/provider-owned indexes. Generic — covers vector stores (Pinecone, Qdrant, PGVector) and text/hybrid engines (Elasticsearch, Typesense, Azure AI Search, OpenSearch). A single scope can mix types; each row is consumed only by the provider matching its IndexType.',
         NULL,
         'SearchScopeExternalIndex',
         'vwSearchScopeExternalIndexes',
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

/* SQL generated to add new entity MJ: Search Scope External Indexes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3b80a286-d1e1-45c2-9648-c850009e1adb', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope External Indexes for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3b80a286-d1e1-45c2-9648-c850009e1adb', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope External Indexes for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3b80a286-d1e1-45c2-9648-c850009e1adb', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope External Indexes for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3b80a286-d1e1-45c2-9648-c850009e1adb', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Search Scope Entities */

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
         '20bcabec-413f-4985-8f5a-6bc262e75f81',
         'MJ: Search Scope Entities',
         'Search Scope Entities',
         'Controls which entities participate in entity and full-text search within a scope, with optional per-entity filter and user-search-string overrides.',
         NULL,
         'SearchScopeEntity',
         'vwSearchScopeEntities',
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

/* SQL generated to add new entity MJ: Search Scope Entities to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '20bcabec-413f-4985-8f5a-6bc262e75f81', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Entities for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('20bcabec-413f-4985-8f5a-6bc262e75f81', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Entities for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('20bcabec-413f-4985-8f5a-6bc262e75f81', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Entities for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('20bcabec-413f-4985-8f5a-6bc262e75f81', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Search Scope Storage Accounts */

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
         'ed43d812-86d7-42f6-a2a2-2e657acaede2',
         'MJ: Search Scope Storage Accounts',
         'Search Scope Storage Accounts',
         'Controls which file storage accounts/folders participate in a scope.',
         NULL,
         'SearchScopeStorageAccount',
         'vwSearchScopeStorageAccounts',
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

/* SQL generated to add new entity MJ: Search Scope Storage Accounts to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ed43d812-86d7-42f6-a2a2-2e657acaede2', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Storage Accounts for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ed43d812-86d7-42f6-a2a2-2e657acaede2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Storage Accounts for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ed43d812-86d7-42f6-a2a2-2e657acaede2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Storage Accounts for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ed43d812-86d7-42f6-a2a2-2e657acaede2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: AI Agent Search Scopes */

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
         'c1406bfb-9351-4bf5-966a-70b9a5d82166',
         'MJ: AI Agent Search Scopes',
         'AI Agent Search Scopes',
         'Many-to-many between agents and search scopes, with phase and scheduling control. Drives both pre-execution RAG and agent-invoked scoped search.',
         NULL,
         'AIAgentSearchScope',
         'vwAIAgentSearchScopes',
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

/* SQL generated to add new entity MJ: AI Agent Search Scopes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c1406bfb-9351-4bf5-966a-70b9a5d82166', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: AI Agent Search Scopes for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c1406bfb-9351-4bf5-966a-70b9a5d82166', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: AI Agent Search Scopes for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c1406bfb-9351-4bf5-966a-70b9a5d82166', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: AI Agent Search Scopes for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c1406bfb-9351-4bf5-966a-70b9a5d82166', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Search Scope Permissions */

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
         'b90fab4e-0336-407a-b6ae-a49dea84d083',
         'MJ: Search Scope Permissions',
         'Search Scope Permissions',
         'Per-user or per-role permission grant on a SearchScope. Exactly one of UserID or RoleID is set on each row; the other is NULL. PermissionLevel is one of None, Read, Search, Manage. Combined with AIAgent."SearchScopeAccess" for agent-side fallbacks via the SearchScopePermissionResolver.',
         NULL,
         'SearchScopePermission',
         'vwSearchScopePermissions',
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

/* SQL generated to add new entity MJ: Search Scope Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b90fab4e-0336-407a-b6ae-a49dea84d083', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Permissions for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('b90fab4e-0336-407a-b6ae-a49dea84d083', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Permissions for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('b90fab4e-0336-407a-b6ae-a49dea84d083', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Permissions for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('b90fab4e-0336-407a-b6ae-a49dea84d083', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Search Execution Logs */

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
         '530982b5-5556-483a-a4d7-338a19e53548',
         'MJ: Search Execution Logs',
         'Search Execution Logs',
         'One row per SearchEngine.search invocation. Populated by SearchEngine''s post-fusion logging hook (Phase 3.2). Read by the Knowledge Hub Search Analytics dashboard (Phase 3.3) and the per-scope tuning CSV export (Phase 3.4).',
         NULL,
         'SearchExecutionLog',
         'vwSearchExecutionLogs',
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

/* SQL generated to add new entity MJ: Search Execution Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '530982b5-5556-483a-a4d7-338a19e53548', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Execution Logs for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('530982b5-5556-483a-a4d7-338a19e53548', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Execution Logs for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('530982b5-5556-483a-a4d7-338a19e53548', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Execution Logs for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('530982b5-5556-483a-a4d7-338a19e53548', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Search Scope Test Queries */

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
         '04ad87e6-eb56-49b7-b9e2-8f5e44458f27',
         'MJ: Search Scope Test Queries',
         'Search Scope Test Queries',
         'Canonical test queries owned by a SearchScope. Used by scope authors to validate tuning changes — re-run a saved query after swapping the reranker or adjusting fusion weights and compare results to the prior run.',
         NULL,
         'SearchScopeTestQuery',
         'vwSearchScopeTestQueries',
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

/* SQL generated to add new entity MJ: Search Scope Test Queries to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '04ad87e6-eb56-49b7-b9e2-8f5e44458f27', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Test Queries for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('04ad87e6-eb56-49b7-b9e2-8f5e44458f27', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Test Queries for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('04ad87e6-eb56-49b7-b9e2-8f5e44458f27', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Search Scope Test Queries for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('04ad87e6-eb56-49b7-b9e2-8f5e44458f27', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeStorageAccount" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeStorageAccount" */
UPDATE __mj."SearchScopeStorageAccount" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeStorageAccount" */
ALTER TABLE __mj."SearchScopeStorageAccount" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopeStorageAccount"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeStorageAccount" */
UPDATE __mj."SearchScopeStorageAccount" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeStorageAccount" */
ALTER TABLE __mj."SearchScopeStorageAccount" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopeStorageAccount"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchExecutionLog" */
UPDATE __mj."SearchExecutionLog" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchExecutionLog" */
ALTER TABLE __mj."SearchExecutionLog" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchExecutionLog"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchExecutionLog" */
UPDATE __mj."SearchExecutionLog" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchExecutionLog" */
ALTER TABLE __mj."SearchExecutionLog" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchExecutionLog"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeProvider" */
UPDATE __mj."SearchScopeProvider" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeProvider" */
ALTER TABLE __mj."SearchScopeProvider" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopeProvider"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeProvider" */
UPDATE __mj."SearchScopeProvider" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeProvider" */
ALTER TABLE __mj."SearchScopeProvider" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopeProvider"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScope" */
UPDATE __mj."SearchScope" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScope" */
ALTER TABLE __mj."SearchScope" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScope"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScope" */
UPDATE __mj."SearchScope" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScope" */
ALTER TABLE __mj."SearchScope" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScope"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeEntity" */
UPDATE __mj."SearchScopeEntity" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeEntity" */
ALTER TABLE __mj."SearchScopeEntity" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopeEntity"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeEntity" */
UPDATE __mj."SearchScopeEntity" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeEntity" */
ALTER TABLE __mj."SearchScopeEntity" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopeEntity"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIAgentSearchScope" */
UPDATE __mj."AIAgentSearchScope" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIAgentSearchScope" */
ALTER TABLE __mj."AIAgentSearchScope" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSearchScope"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIAgentSearchScope" */
UPDATE __mj."AIAgentSearchScope" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIAgentSearchScope" */
ALTER TABLE __mj."AIAgentSearchScope" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSearchScope"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeTestQuery" */
UPDATE __mj."SearchScopeTestQuery" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeTestQuery" */
ALTER TABLE __mj."SearchScopeTestQuery" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopeTestQuery"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeTestQuery" */
UPDATE __mj."SearchScopeTestQuery" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeTestQuery" */
ALTER TABLE __mj."SearchScopeTestQuery" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopeTestQuery"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopePermission" */
UPDATE __mj."SearchScopePermission" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopePermission" */
ALTER TABLE __mj."SearchScopePermission" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopePermission"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopePermission" */
UPDATE __mj."SearchScopePermission" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopePermission" */
ALTER TABLE __mj."SearchScopePermission" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopePermission"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeExternalIndex" */
UPDATE __mj."SearchScopeExternalIndex" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."SearchScopeExternalIndex" */
ALTER TABLE __mj."SearchScopeExternalIndex" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopeExternalIndex"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeExternalIndex" */
UPDATE __mj."SearchScopeExternalIndex" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SearchScopeExternalIndex" */
ALTER TABLE __mj."SearchScopeExternalIndex" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."SearchScopeExternalIndex"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '948e9c24-c50e-47bf-8a93-d4abaa0bbbbb' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'SearchScopeAccess')
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
        '948e9c24-c50e-47bf-8a93-d4abaa0bbbbb',
        'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- "Entity": "MJ": "AI" "Agents"
        100139,
        'SearchScopeAccess',
        'Search Scope Access',
        'Controls the agent''s search capability. All = may use any scope including Global; search action does not restrict. Assigned = may use ONLY scopes explicitly linked via AIAgentSearchScope; scoped search action enforces this. None = agent has no search capability; the scoped search action rejects all requests.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'None',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0dfcf074-13a3-4068-b5d9-6032d424d112' OR ("EntityID" = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND "Name" = 'ID')
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
        '0dfcf074-13a3-4068-b5d9-6032d424d112',
        'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- "Entity": "MJ": "Search" "Scope" "Storage" "Accounts"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32221c7e-325d-4afb-b7a5-3b0f5f52834d' OR ("EntityID" = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND "Name" = 'SearchScopeID')
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
        '32221c7e-325d-4afb-b7a5-3b0f5f52834d',
        'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- "Entity": "MJ": "Search" "Scope" "Storage" "Accounts"
        100002,
        'SearchScopeID',
        'Search Scope ID',
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
        '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bd032d1e-1b51-48ba-ace1-aef987c7f7ab' OR ("EntityID" = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND "Name" = 'FileStorageAccountID')
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
        'bd032d1e-1b51-48ba-ace1-aef987c7f7ab',
        'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- "Entity": "MJ": "Search" "Scope" "Storage" "Accounts"
        100003,
        'FileStorageAccountID',
        'File Storage Account ID',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6255f1d5-a755-4355-a34c-cf89e18f4ba6' OR ("EntityID" = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND "Name" = 'FolderPath')
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
        '6255f1d5-a755-4355-a34c-cf89e18f4ba6',
        'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- "Entity": "MJ": "Search" "Scope" "Storage" "Accounts"
        100004,
        'FolderPath',
        'Folder Path',
        'Optional folder path restriction. NULL = entire storage account. Example: /policies/hr/. Rendered as a Nunjucks template with SearchContext variables so platforms can do per-tenant folder routing like /tenants/{{ context."PrimaryScopeRecordID" }}/.',
        'TEXT',
        2000,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3197e4b7-b5ec-4cef-b6f7-bfce3b292f53' OR ("EntityID" = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND "Name" = '__mj_CreatedAt')
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
        '3197e4b7-b5ec-4cef-b6f7-bfce3b292f53',
        'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- "Entity": "MJ": "Search" "Scope" "Storage" "Accounts"
        100005,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5b6805c1-bbd9-47e1-a678-6c9525ac5449' OR ("EntityID" = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND "Name" = '__mj_UpdatedAt')
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
        '5b6805c1-bbd9-47e1-a678-6c9525ac5449',
        'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- "Entity": "MJ": "Search" "Scope" "Storage" "Accounts"
        100006,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4322aa22-d7bc-485d-9196-3d5b6de3185d' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'ID')
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
        '4322aa22-d7bc-485d-9196-3d5b6de3185d',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f0497a66-b889-4b67-bf77-1bb7a21754cf' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'SearchScopeID')
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
        'f0497a66-b889-4b67-bf77-1bb7a21754cf',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100002,
        'SearchScopeID',
        'Search Scope ID',
        'The SearchScope this invocation targeted. NULL for unscoped global search.',
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
        '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '17d7ab0c-2ecc-4bed-9618-dd92f465d25b' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'UserID')
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
        '17d7ab0c-2ecc-4bed-9618-dd92f465d25b',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100003,
        'UserID',
        'User ID',
        'The User who initiated the search. NULL for system / unauthenticated callers.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6ac56098-a8c6-432d-a5a2-2c8c40e5ad1d' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'AIAgentID')
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
        '6ac56098-a8c6-432d-a5a2-2c8c40e5ad1d',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100004,
        'AIAgentID',
        'AI Agent ID',
        'The AIAgent identity if the search was invoked from an agent (e.g. ScopedSearchAction). NULL for direct human-initiated searches.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '13617353-79f1-409b-aa4f-9fd96a5a7aad' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'Query')
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
        '13617353-79f1-409b-aa4f-9fd96a5a7aad',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100005,
        'Query',
        'Query',
        'Raw query string the user / agent submitted. TEXT because some queries are long (full sentences, snippets). Stored verbatim for analytics — do NOT rely on this for permission decisions.',
        'TEXT',
        -1,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ff77dd4a-6bfc-4ae3-9e61-039d9b96941f' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'TotalDurationMs')
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
        'ff77dd4a-6bfc-4ae3-9e61-039d9b96941f',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100006,
        'TotalDurationMs',
        'Total Duration Ms',
        'End-to-end search duration in milliseconds, measured at the SearchEngine.search call boundary (provider runs + fusion + rerank + permission filter + enrichment).',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c5906c5c-b5bc-48b2-a819-746cd09e913b' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'ResultCount')
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
        'c5906c5c-b5bc-48b2-a819-746cd09e913b',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100007,
        'ResultCount',
        'Result Count',
        'Number of results returned to the caller after permission filtering, deduplication, and score-threshold trimming. Use this as the hit-rate denominator (rows where ResultCount > 0).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ccb15200-656c-4ea2-972d-34f48f9f78e4' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'RerankerName')
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
        'ccb15200-656c-4ea2-972d-34f48f9f78e4',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100008,
        'RerankerName',
        'Reranker Name',
        'BaseReRanker."Name" of the reranker that ran (e.g. ''Cohere'', ''Voyage'', ''OpenAI'', ''BGE'', ''NoopReRanker''). NULL when no rerank stage executed for this invocation.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '72bee633-f344-4bb1-874b-93e551ae60da' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'RerankerCostCents')
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
        '72bee633-f344-4bb1-874b-93e551ae60da',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100009,
        'RerankerCostCents',
        'Reranker Cost Cents',
        'Total reranker spend in cents for this invocation, populated from the BaseReRanker."CostReporter" callback via RerankerBudgetGuard. NULL when no rerank ran or no real-provider cost was incurred (Noop / BGE).',
        'decimal',
        9,
        10,
        4,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8af906f8-8e8c-423e-b7e9-6e2157823cab' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'Status')
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
        '8af906f8-8e8c-423e-b7e9-6e2157823cab',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100010,
        'Status',
        'Status',
        'Outcome of the search: ''Success'' (results returned, possibly empty), ''Failure'' (an exception bubbled out — see FailureReason), ''Forbidden'' (the caller lacked SearchScopePermission for the requested scope). Constrained by CK_SearchExecutionLog_Status.',
        'TEXT',
        40,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9d69e7a8-1917-4231-a697-a5a5c9788d0e' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'FailureReason')
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
        '9d69e7a8-1917-4231-a697-a5a5c9788d0e',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100011,
        'FailureReason',
        'Failure Reason',
        'Short human-readable failure reason when Status = ''Failure'' or ''Forbidden''. NULL on success.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3f7fceec-be05-4ad3-b4c2-998c087dca75' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'ProvidersJSON')
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
        '3f7fceec-be05-4ad3-b4c2-998c087dca75',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100012,
        'ProvidersJSON',
        'Providers JSON',
        'JSON array of per-provider breakdown entries: [{"Provider":"Vector","DurationMs":123,"ResultCount":5,"ErrorMessage":null}, ...]. Used by the analytics dashboard for p50/p95 latency-by-provider charts and to spot consistently slow providers.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '475fc885-98ca-43a9-89bb-88cd64531c98' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = '__mj_CreatedAt')
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
        '475fc885-98ca-43a9-89bb-88cd64531c98',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5eb11d11-e68b-407a-b681-bf711f646638' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = '__mj_UpdatedAt')
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
        '5eb11d11-e68b-407a-b681-bf711f646638',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c14a9b8e-7dc2-4ee8-865a-cb9e310df2e5' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = 'ID')
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
        'c14a9b8e-7dc2-4ee8-865a-cb9e310df2e5',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '451a3f52-a5df-4099-8bc0-e3588c9220ac' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = 'SearchScopeID')
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
        '451a3f52-a5df-4099-8bc0-e3588c9220ac',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
        100002,
        'SearchScopeID',
        'Search Scope ID',
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
        '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '95740918-b09c-4eeb-a612-352bee7b4d1c' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = 'SearchProviderID')
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
        '95740918-b09c-4eeb-a612-352bee7b4d1c',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
        100003,
        'SearchProviderID',
        'Search Provider ID',
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
        'C6923FA5-3F3D-4756-A2D8-E57125AF450F',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f66d6720-e1e5-48aa-934f-7c2b3784ef0d' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = 'Enabled')
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
        'f66d6720-e1e5-48aa-934f-7c2b3784ef0d',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
        100004,
        'Enabled',
        'Enabled',
        'Whether this provider is active for this scope. Lets an admin toggle providers off per-scope without deleting the row.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b907068f-abd3-43a1-bf34-820cd089bc9d' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = 'MaxResultsOverride')
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
        'b907068f-abd3-43a1-bf34-820cd089bc9d',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
        100005,
        'MaxResultsOverride',
        'Max Results Override',
        'Override the max-results value for this provider within this scope. NULL = use the provider''s default.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'affa4ea1-e4a3-4e9a-99cc-d9affaefa432' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = 'ProviderConfigOverride')
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
        'affa4ea1-e4a3-4e9a-99cc-d9affaefa432',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
        100006,
        'ProviderConfigOverride',
        'Provider Config Override',
        'JSON override for provider-specific configuration within this scope. Provider interprets.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '58e855e8-f804-4a0e-b0ac-722ec76941d8' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = 'QueryTransformTemplateID')
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
        '58e855e8-f804-4a0e-b0ac-722ec76941d8',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
        100007,
        'QueryTransformTemplateID',
        'Query Transform Template ID',
        'Optional FK to Templates. When set, the user/agent query is rewritten through this Template before being sent to this provider. Lets vector providers get a chunk-shaped rewrite while FTS providers get keyword extraction within the same scope. Resolution order: this > AIAgentSearchScope."QueryTemplateID" > raw lastUserMessage.',
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
        '48248F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1f94a390-0411-4581-aef7-5384b72ee79d' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = '__mj_CreatedAt')
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
        '1f94a390-0411-4581-aef7-5384b72ee79d',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3efd97cc-7ffa-4a58-a5b7-b31e44fbef36' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = '__mj_UpdatedAt')
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
        '3efd97cc-7ffa-4a58-a5b7-b31e44fbef36',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cf722abd-e0ac-4791-a694-1a5c308844a2' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'ID')
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
        'cf722abd-e0ac-4791-a694-1a5c308844a2',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b01cc6b5-03a8-46d2-8c7f-b6f9dbb4fef2' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'Name')
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
        'b01cc6b5-03a8-46d2-8c7f-b6f9dbb4fef2',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100002,
        'Name',
        'Name',
        'Human-readable scope name (e.g., "HR Policies", "Engineering Docs"). Unique across the system.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7c71ab7f-5318-42c6-b34f-5d6ef4462c90' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'Description')
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
        '7c71ab7f-5318-42c6-b34f-5d6ef4462c90',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100003,
        'Description',
        'Description',
        'Detailed description of what this scope covers. Surfaced to agents in the available-scopes prompt injection so the LLM can choose a scope.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c639cb34-93b2-45fd-a8b6-197f01f30da3' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'Icon')
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
        'c639cb34-93b2-45fd-a8b6-197f01f30da3',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100004,
        'Icon',
        'Icon',
        'Font Awesome (or equivalent) icon class used by the scope selector UI.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '84d4b55f-4270-4c1a-8e3e-b5f6e8879b5b' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'IsGlobal')
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
        '84d4b55f-4270-4c1a-8e3e-b5f6e8879b5b',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100005,
        'IsGlobal',
        'Is Global',
        'If true, this scope includes everything (equivalent to no scope filtering). Exactly one Global scope should exist; it is seeded via metadata sync.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a4a044ab-961d-4100-8e92-7bb10f8433cd' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'IsDefault')
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
        'a4a044ab-961d-4100-8e92-7bb10f8433cd',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100006,
        'IsDefault',
        'Is Default',
        'If true, this is the default scope for users/agents that do not specify one.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a515dcd2-c9cd-471f-a6f2-2db35d3c5c03' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'OwnerUserID')
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
        'a515dcd2-c9cd-471f-a6f2-2db35d3c5c03',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100007,
        'OwnerUserID',
        'Owner User ID',
        'NULL = organization-wide scope. Set = personal scope owned by this user (visible/usable only by that user unless explicitly shared).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cee83cdc-cd11-4b85-8ca0-9f5841cc883f' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'Status')
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
        'cee83cdc-cd11-4b85-8ca0-9f5841cc883f',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100008,
        'Status',
        'Status',
        'Lifecycle status. Only Active scopes are considered at query time.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '030df56e-9df6-4e5a-ae54-6c00c09356c5' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'StartAt')
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
        '030df56e-9df6-4e5a-ae54-6c00c09356c5',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100009,
        'StartAt',
        'Start At',
        'Optional time-window activation. Scope is inactive before StartAt. NULL = immediately active.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0262fc04-f9a2-42bf-a0a4-7028bf1ae80e' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'EndAt')
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
        '0262fc04-f9a2-42bf-a0a4-7028bf1ae80e',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100010,
        'EndAt',
        'End At',
        'Optional time-window deactivation. Scope is inactive after EndAt. NULL = no expiry.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9641ca58-b2df-48ce-b3ac-976c9e7f63d1' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'ScopeConfig')
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
        '9641ca58-b2df-48ce-b3ac-976c9e7f63d1',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100011,
        'ScopeConfig',
        'Scope Config',
        'JSON configuration for advanced scope behavior. Recognized keys: rrfK (RRF k parameter), fusionWeights (per-provider weights), reRanker (optional re-ranker stage config: driverClass, inputTopN, outputTopN, config), permissionOverfetchFactor.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7183a757-830f-482e-9e41-77e5e641b814' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'SearchContextConfig')
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
        '7183a757-830f-482e-9e41-77e5e641b814',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100012,
        'SearchContextConfig',
        'Search Context Config',
        'JSON defining available multi-tenant SearchContext dimensions, inheritance modes, and validation rules. Uses the SecondaryScopeConfig structure shared with the agent memory system (@memberjunction/ai-core-plus). NULL = scope is not multi-tenant aware.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9dea41dd-e375-4d15-9a9a-4136ffc35194' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'RerankerBudgetCents')
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
        '9dea41dd-e375-4d15-9a9a-4136ffc35194',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100013,
        'RerankerBudgetCents',
        'Reranker Budget Cents',
        'Optional cap on reranker spend (in cents) per search invocation against this scope. NULL means uncapped — existing behavior. When set, the SearchEngine''s budget guard short-circuits any reranker call whose projected cost would push the run total past this value, and accumulates actual post-call cost via each reranker''s CostReporter callback (BaseReRanker."CostReporter"). Real-provider rerankers (Cohere, Voyage, OpenAI) report cost; NoopReRanker and BGEReRanker report zero (local / pass-through).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b481edf6-17d5-4dee-925c-fe300eef446f' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = '__mj_CreatedAt')
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
        'b481edf6-17d5-4dee-925c-fe300eef446f',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'daac5cc2-1733-4e8a-9510-df26dd36d2f7' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = '__mj_UpdatedAt')
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
        'daac5cc2-1733-4e8a-9510-df26dd36d2f7',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1bd7c23c-8241-4e1a-b247-a8f14e32bc19' OR ("EntityID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND "Name" = 'ID')
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
        '1bd7c23c-8241-4e1a-b247-a8f14e32bc19',
        '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- "Entity": "MJ": "Search" "Scope" "Entities"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'edbc9655-6e2e-42af-bf84-aed9da27c950' OR ("EntityID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND "Name" = 'SearchScopeID')
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
        'edbc9655-6e2e-42af-bf84-aed9da27c950',
        '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- "Entity": "MJ": "Search" "Scope" "Entities"
        100002,
        'SearchScopeID',
        'Search Scope ID',
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
        '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '04d1e6ab-0ea1-44f8-932a-56359cea29b6' OR ("EntityID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND "Name" = 'EntityID')
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
        '04d1e6ab-0ea1-44f8-932a-56359cea29b6',
        '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- "Entity": "MJ": "Search" "Scope" "Entities"
        100003,
        'EntityID',
        'Entity ID',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '94f3fc15-08c6-4fe2-ac3b-d234dfffabbe' OR ("EntityID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND "Name" = 'ExtraFilter')
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
        '94f3fc15-08c6-4fe2-ac3b-d234dfffabbe',
        '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- "Entity": "MJ": "Search" "Scope" "Entities"
        100004,
        'ExtraFilter',
        'Extra Filter',
        'Optional SQL filter applied to this entity''s search within this scope. Example: Status=''Published'' AND DepartmentID=''abc''. Rendered as a Nunjucks template with SearchContext variables for multi-tenant filtering.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '441d9670-ae89-4f60-aa1f-559e58b84ca0' OR ("EntityID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND "Name" = 'UserSearchString')
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
        '441d9670-ae89-4f60-aa1f-559e58b84ca0',
        '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- "Entity": "MJ": "Search" "Scope" "Entities"
        100005,
        'UserSearchString',
        'User Search String',
        'Optional override for the UserSearchString passed to RunView for this entity within this scope. Nunjucks template (e.g., "{{ query }} AND type:policy"). NULL = pass the user''s actual query through as-is.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32b349a9-34ae-4ff5-9381-8b8b3b713488' OR ("EntityID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND "Name" = '__mj_CreatedAt')
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
        '32b349a9-34ae-4ff5-9381-8b8b3b713488',
        '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- "Entity": "MJ": "Search" "Scope" "Entities"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '894d9770-e13a-4574-9742-6b763edda34d' OR ("EntityID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND "Name" = '__mj_UpdatedAt')
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
        '894d9770-e13a-4574-9742-6b763edda34d',
        '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- "Entity": "MJ": "Search" "Scope" "Entities"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f68ec93d-8cb6-4d35-881c-0dccd4e42db6' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'ID')
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
        'f68ec93d-8cb6-4d35-881c-0dccd4e42db6',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a2e7a5d8-b241-48fa-b0ad-979dae320266' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'AgentID')
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
        'a2e7a5d8-b241-48fa-b0ad-979dae320266',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100002,
        'AgentID',
        'Agent ID',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c0e907e7-044e-4298-9bbe-7a2387b855f4' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'SearchScopeID')
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
        'c0e907e7-044e-4298-9bbe-7a2387b855f4',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100003,
        'SearchScopeID',
        'Search Scope ID',
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
        '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd5be679c-0809-4adb-ae19-71ce14fa00fd' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'Phase')
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
        'd5be679c-0809-4adb-ae19-71ce14fa00fd',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100004,
        'Phase',
        'Phase',
        'When this scope is used: PreExecution (injected as retrieved context before the agent runs), AgentInvoked (callable via the scoped search Action), or Both.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Both',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e6ef21b2-cb3c-4d05-8a73-65c55897468c' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'Status')
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
        'e6ef21b2-cb3c-4d05-8a73-65c55897468c',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100005,
        'Status',
        'Status',
        'Lifecycle status. Only Active rows are considered at runtime.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c42e55cf-da62-47f7-9cdc-baf87cf00cfb' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'StartAt')
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
        'c42e55cf-da62-47f7-9cdc-baf87cf00cfb',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100006,
        'StartAt',
        'Start At',
        'Time-windowed activation for this agent-scope assignment. NULL = immediately active.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e12bf45e-e0cd-4188-a221-82c9fc22ebb2' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'EndAt')
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
        'e12bf45e-e0cd-4188-a221-82c9fc22ebb2',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100007,
        'EndAt',
        'End At',
        'Time-windowed deactivation for this agent-scope assignment. NULL = no expiry.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '301ffe95-1405-4200-85c0-e2ee4badde99' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'Priority')
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
        '301ffe95-1405-4200-85c0-e2ee4badde99',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100008,
        'Priority',
        'Priority',
        'Ordering within Phase. Lower = higher priority. Used for pre-execution ordering and as default preference for agent-invoked scope selection.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(100)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '543f7e2c-80e0-4024-9167-667616359f68' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'MaxResults')
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
        '543f7e2c-80e0-4024-9167-667616359f68',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100009,
        'MaxResults',
        'Max Results',
        'Override max results for this scope when used by this agent. NULL = use scope/engine default.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2eec11ca-4f71-4aef-ac50-97f2372c93b1' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'MinScore')
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
        '2eec11ca-4f71-4aef-ac50-97f2372c93b1',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100010,
        'MinScore',
        'Min Score',
        'Override min score threshold (0.0000–1.0000). NULL = use engine default.',
        'decimal',
        5,
        5,
        4,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e8e32952-3858-475f-bfb6-c918d181d270' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'QueryTemplateID')
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
        'e8e32952-3858-475f-bfb6-c918d181d270',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100011,
        'QueryTemplateID',
        'Query Template ID',
        'FK to Templates. MJ Template used to generate the search query from conversation context (lastUserMessage, recentMessages, payload, etc.). NULL = use lastUserMessage as-is. Can be further specialized per-provider via SearchScopeProvider."QueryTransformTemplateID".',
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
        '48248F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b5ce6d24-4c59-4bbb-b2f6-e8f0ffbedd40' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'FusionWeightsOverride')
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
        'b5ce6d24-4c59-4bbb-b2f6-e8f0ffbedd40',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100012,
        'FusionWeightsOverride',
        'Fusion Weights Override',
        'JSON override for RRF per-provider fusion weights when this agent uses this scope. Resolution order: AIAgentSearchScope."FusionWeightsOverride" > SearchScope."ScopeConfig".fusionWeights > engine defaults. Example: { "vector": 2.0, "fulltext": 1.0, "entity": 1.0 }.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44a7c7b2-7c8a-4199-a08d-c068df677e6b' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'IsDefault')
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
        '44a7c7b2-7c8a-4199-a08d-c068df677e6b',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100013,
        'IsDefault',
        'Is Default',
        'If true, this is the agent''s default scope when no scope is specified in a tool call.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a6522a09-72f4-472b-9601-1fc16d475ddc' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = '__mj_CreatedAt')
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
        'a6522a09-72f4-472b-9601-1fc16d475ddc',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6ad7c7cf-b0e7-4d59-898d-0df744f6abe7' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = '__mj_UpdatedAt')
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
        '6ad7c7cf-b0e7-4d59-898d-0df744f6abe7',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3f2103b7-2fcf-4bbc-aea2-c53a0bbd3822' OR ("EntityID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND "Name" = 'ID')
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
        '3f2103b7-2fcf-4bbc-aea2-c53a0bbd3822',
        '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- "Entity": "MJ": "Search" "Scope" "Test" "Queries"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cfe7d72f-79d3-4aa9-8469-207c2151c14b' OR ("EntityID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND "Name" = 'SearchScopeID')
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
        'cfe7d72f-79d3-4aa9-8469-207c2151c14b',
        '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- "Entity": "MJ": "Search" "Scope" "Test" "Queries"
        100002,
        'SearchScopeID',
        'Search Scope ID',
        'The SearchScope this test query belongs to. Cascade-restricted via FK so accidental scope deletion preserves test history.',
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
        '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3a38c86b-90e6-4b6b-84bd-505f5c079e12' OR ("EntityID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND "Name" = 'Label')
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
        '3a38c86b-90e6-4b6b-84bd-505f5c079e12',
        '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- "Entity": "MJ": "Search" "Scope" "Test" "Queries"
        100003,
        'Label',
        'Label',
        'Short human-readable label for the test query, shown in the form''s test-query grid (e.g. "VIP customer escalation", "expense reimbursement policy").',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6de3b564-29da-4a88-a1ea-fd968e86108d' OR ("EntityID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND "Name" = 'Query')
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
        '6de3b564-29da-4a88-a1ea-fd968e86108d',
        '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- "Entity": "MJ": "Search" "Scope" "Test" "Queries"
        100004,
        'Query',
        'Query',
        'The query text itself. TEXT because canonical queries can be full sentences or chunks of natural-language context.',
        'TEXT',
        -1,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a8de8947-b323-4098-9fe6-e06ca34c80c5' OR ("EntityID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND "Name" = 'ExpectedTopResultEntity')
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
        'a8de8947-b323-4098-9fe6-e06ca34c80c5',
        '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- "Entity": "MJ": "Search" "Scope" "Test" "Queries"
        100005,
        'ExpectedTopResultEntity',
        'Expected Top Result Entity',
        'Optional MJ entity name (e.g. "Contacts", "Documents") of the expected top result. When set together with ExpectedTopResultRecordID, lets the test runner assert that the tuned scope returns the right record at rank #1 — a regression tripwire for fusion / reranker changes.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd75cfa63-3b07-4f40-bb28-47c5365dfeda' OR ("EntityID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND "Name" = 'ExpectedTopResultRecordID')
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
        'd75cfa63-3b07-4f40-bb28-47c5365dfeda',
        '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- "Entity": "MJ": "Search" "Scope" "Test" "Queries"
        100006,
        'ExpectedTopResultRecordID',
        'Expected Top Result Record ID',
        'Optional record ID of the expected top result, paired with ExpectedTopResultEntity. NULL = no assertion (the query is exploratory).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e4ade8da-300c-4a10-a142-9680f9882d7c' OR ("EntityID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND "Name" = 'Notes')
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
        'e4ade8da-300c-4a10-a142-9680f9882d7c',
        '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- "Entity": "MJ": "Search" "Scope" "Test" "Queries"
        100007,
        'Notes',
        'Notes',
        'Free-form notes explaining why this query is canonical or what edge case it represents.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '923c5d6d-bed9-4550-929a-83cd2ff44c0a' OR ("EntityID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND "Name" = '__mj_CreatedAt')
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
        '923c5d6d-bed9-4550-929a-83cd2ff44c0a',
        '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- "Entity": "MJ": "Search" "Scope" "Test" "Queries"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3f4dda5d-0d6b-43ad-a9a6-6569e8038c78' OR ("EntityID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND "Name" = '__mj_UpdatedAt')
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
        '3f4dda5d-0d6b-43ad-a9a6-6569e8038c78',
        '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- "Entity": "MJ": "Search" "Scope" "Test" "Queries"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a65342f4-8289-4fe8-84e0-b0ad6abbf27e' OR ("EntityID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND "Name" = 'ID')
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
        'a65342f4-8289-4fe8-84e0-b0ad6abbf27e',
        'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- "Entity": "MJ": "Search" "Scope" "Permissions"
        100001,
        'ID',
        'ID',
        'Primary key. Auto-generated.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3f4d48ac-a66f-4adf-9dfe-9931eda4b876' OR ("EntityID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND "Name" = 'SearchScopeID')
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
        '3f4d48ac-a66f-4adf-9dfe-9931eda4b876',
        'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- "Entity": "MJ": "Search" "Scope" "Permissions"
        100002,
        'SearchScopeID',
        'Search Scope ID',
        'The SearchScope this permission row applies to.',
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
        '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0b6000c0-2ada-462a-95db-347997d1b7dd' OR ("EntityID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND "Name" = 'UserID')
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
        '0b6000c0-2ada-462a-95db-347997d1b7dd',
        'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- "Entity": "MJ": "Search" "Scope" "Permissions"
        100003,
        'UserID',
        'User ID',
        'The user this permission applies to. Mutually exclusive with RoleID — exactly one must be set.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '806a6bef-8e3a-4957-b122-dd08b62727d2' OR ("EntityID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND "Name" = 'RoleID')
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
        '806a6bef-8e3a-4957-b122-dd08b62727d2',
        'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- "Entity": "MJ": "Search" "Scope" "Permissions"
        100004,
        'RoleID',
        'Role ID',
        'The role this permission applies to. Mutually exclusive with UserID — exactly one must be set. Permissions granted via roles flow to all users in that role.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8d0985d-b898-402a-83c8-e9816acd3965' OR ("EntityID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND "Name" = 'PermissionLevel')
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
        'd8d0985d-b898-402a-83c8-e9816acd3965',
        'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- "Entity": "MJ": "Search" "Scope" "Permissions"
        100005,
        'PermissionLevel',
        'Permission Level',
        'Capability granted on this SearchScope. None = explicit deny (overrides role grants), Read = view scope metadata, Search = invoke ScopedSearchAction, Manage = full edit including authoring of permission rows. The resolver picks the highest level when multiple grants apply (direct + role).',
        'TEXT',
        40,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '30576dd7-1752-48bd-85b1-d9655bbb055f' OR ("EntityID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND "Name" = '__mj_CreatedAt')
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
        '30576dd7-1752-48bd-85b1-d9655bbb055f',
        'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- "Entity": "MJ": "Search" "Scope" "Permissions"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '26a95bd0-ff2e-420c-afce-f005811f1e47' OR ("EntityID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND "Name" = '__mj_UpdatedAt')
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
        '26a95bd0-ff2e-420c-afce-f005811f1e47',
        'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- "Entity": "MJ": "Search" "Scope" "Permissions"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7a8d248c-ca1c-4851-9b30-c2f39950d0f0' OR ("EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND "Name" = 'ID')
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
        '7a8d248c-ca1c-4851-9b30-c2f39950d0f0',
        '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- "Entity": "MJ": "Search" "Scope" "External" "Indexes"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c7b0e695-7a9d-4d36-a860-caa0fe743a93' OR ("EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND "Name" = 'SearchScopeID')
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
        'c7b0e695-7a9d-4d36-a860-caa0fe743a93',
        '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- "Entity": "MJ": "Search" "Scope" "External" "Indexes"
        100002,
        'SearchScopeID',
        'Search Scope ID',
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
        '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5d7f70e8-e16b-48a7-b0f7-b29355040e84' OR ("EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND "Name" = 'IndexType')
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
        '5d7f70e8-e16b-48a7-b0f7-b29355040e84',
        '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- "Entity": "MJ": "Search" "Scope" "External" "Indexes"
        100003,
        'IndexType',
        'Index Type',
        'Discriminator. Determines which provider class consumes this row: Vector | Elasticsearch | Typesense | AzureAISearch | OpenSearch | Other.',
        'TEXT',
        80,
        0,
        0,
        FALSE,
        'Vector',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cc4c6581-35de-4b31-9049-4f385e83daa4' OR ("EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND "Name" = 'VectorIndexID')
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
        'cc4c6581-35de-4b31-9049-4f385e83daa4',
        '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- "Entity": "MJ": "Search" "Scope" "External" "Indexes"
        100004,
        'VectorIndexID',
        'Vector Index ID',
        'FK to VectorIndex. REQUIRED when IndexType=''Vector''. NULL for all other IndexType values.',
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
        '1D248F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7f0cbab5-d960-4621-bb6e-cbc0340f4968' OR ("EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND "Name" = 'ExternalIndexName')
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
        '7f0cbab5-d960-4621-bb6e-cbc0340f4968',
        '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- "Entity": "MJ": "Search" "Scope" "External" "Indexes"
        100005,
        'ExternalIndexName',
        'External Index Name',
        'For non-vector IndexTypes: the remote engine''s index/collection/alias name (e.g., Elasticsearch index "kb_docs_v3", Typesense collection "articles"). NULL for IndexType=''Vector'' (VectorIndexID resolves the name instead).',
        'TEXT',
        800,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8405e520-f9cc-45a0-86fa-62ba702b706a' OR ("EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND "Name" = 'ExternalIndexConfig')
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
        '8405e520-f9cc-45a0-86fa-62ba702b706a',
        '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- "Entity": "MJ": "Search" "Scope" "External" "Indexes"
        100006,
        'ExternalIndexConfig',
        'External Index Config',
        'JSON with extra connection/config hints the provider needs (cluster alias, routing key, custom analyzer, etc.). Provider-interpreted.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5494ca26-73e8-47e9-a35f-7ccd0aebaa28' OR ("EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND "Name" = 'MetadataFilter')
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
        '5494ca26-73e8-47e9-a35f-7ccd0aebaa28',
        '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- "Entity": "MJ": "Search" "Scope" "External" "Indexes"
        100007,
        'MetadataFilter',
        'Metadata Filter',
        'JSON filter expression applied as a native metadata filter on the remote engine. Pinecone/Qdrant/PGVector metadata filter, or Elasticsearch filter DSL, etc. Rendered as a Nunjucks template so SearchContext."PrimaryScopeRecordID" and SearchContext."SecondaryScopes".* can be interpolated for multi-tenant filtering.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6fbbbd9f-d8f3-4e8a-a8d7-bfec6ce6fe73' OR ("EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND "Name" = '__mj_CreatedAt')
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
        '6fbbbd9f-d8f3-4e8a-a8d7-bfec6ce6fe73',
        '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- "Entity": "MJ": "Search" "Scope" "External" "Indexes"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '062cbf53-a21b-46de-9bce-4a2e0cb5c621' OR ("EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND "Name" = '__mj_UpdatedAt')
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
        '062cbf53-a21b-46de-9bce-4a2e0cb5c621',
        '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- "Entity": "MJ": "Search" "Scope" "External" "Indexes"
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
                                       ('6f1ac0b5-6158-4f2d-b5ab-0850bc25141c', 'CEE83CDC-CD11-4B85-8CA0-9F5841CC883F', 1, 'Active', 'Active', NOW(), NOW());

/* SQL text to insert entity field value with ID 4f635292-5f4f-4a44-8b58-6ca94da815f2 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('4f635292-5f4f-4a44-8b58-6ca94da815f2', 'CEE83CDC-CD11-4B85-8CA0-9F5841CC883F', 2, 'Inactive', 'Inactive', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID CEE83CDC-CD11-4B85-8CA0-9F5841CC883F */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='CEE83CDC-CD11-4B85-8CA0-9F5841CC883F';

/* SQL text to insert entity field value with ID 49e613cc-f04b-4bf8-9ac0-378676e408bf */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('49e613cc-f04b-4bf8-9ac0-378676e408bf', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 1, 'AzureAISearch', 'AzureAISearch', NOW(), NOW());

/* SQL text to insert entity field value with ID 9c428c70-9d22-4d99-8069-abd754c3ae01 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('9c428c70-9d22-4d99-8069-abd754c3ae01', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 2, 'Elasticsearch', 'Elasticsearch', NOW(), NOW());

/* SQL text to insert entity field value with ID 75dd36f9-9a4c-40e1-88b7-b170e39c03cb */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('75dd36f9-9a4c-40e1-88b7-b170e39c03cb', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 3, 'OpenSearch', 'OpenSearch', NOW(), NOW());

/* SQL text to insert entity field value with ID f0a35da1-81dc-45c2-b25c-2d520233cc7c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('f0a35da1-81dc-45c2-b25c-2d520233cc7c', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 4, 'Other', 'Other', NOW(), NOW());

/* SQL text to insert entity field value with ID b90300bb-98d5-4e87-956f-dffcfe7ea1e7 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('b90300bb-98d5-4e87-956f-dffcfe7ea1e7', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 5, 'Typesense', 'Typesense', NOW(), NOW());

/* SQL text to insert entity field value with ID 6032eac6-36cf-4875-8346-f5e95da6382b */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('6032eac6-36cf-4875-8346-f5e95da6382b', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 6, 'Vector', 'Vector', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 5D7F70E8-E16B-48A7-B0F7-B29355040E84 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='5D7F70E8-E16B-48A7-B0F7-B29355040E84';

/* SQL text to insert entity field value with ID e7a3f66e-342d-44b9-91ab-9c24a404419f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e7a3f66e-342d-44b9-91ab-9c24a404419f', 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD', 1, 'AgentInvoked', 'AgentInvoked', NOW(), NOW());

/* SQL text to insert entity field value with ID ffe4cdb4-7c32-43cc-b1cc-35be45c8b595 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ffe4cdb4-7c32-43cc-b1cc-35be45c8b595', 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD', 2, 'Both', 'Both', NOW(), NOW());

/* SQL text to insert entity field value with ID 9398fbcf-17a0-43e6-b8c2-5845ee3763cf */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('9398fbcf-17a0-43e6-b8c2-5845ee3763cf', 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD', 3, 'PreExecution', 'PreExecution', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID D5BE679C-0809-4ADB-AE19-71CE14FA00FD */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='D5BE679C-0809-4ADB-AE19-71CE14FA00FD';

/* SQL text to insert entity field value with ID 35f57202-6cf1-47f0-a5b5-c01d5b4da6de */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('35f57202-6cf1-47f0-a5b5-c01d5b4da6de', 'E6EF21B2-CB3C-4D05-8A73-65C55897468C', 1, 'Active', 'Active', NOW(), NOW());

/* SQL text to insert entity field value with ID 9f96f766-1bb9-459a-9459-762b75d16e36 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('9f96f766-1bb9-459a-9459-762b75d16e36', 'E6EF21B2-CB3C-4D05-8A73-65C55897468C', 2, 'Inactive', 'Inactive', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID E6EF21B2-CB3C-4D05-8A73-65C55897468C */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='E6EF21B2-CB3C-4D05-8A73-65C55897468C';

/* SQL text to insert entity field value with ID bcbd305f-6ca0-4aef-bd50-6f930e48a09a */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('bcbd305f-6ca0-4aef-bd50-6f930e48a09a', '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB', 1, 'All', 'All', NOW(), NOW());

/* SQL text to insert entity field value with ID aab0f897-3ba7-41b9-9f27-fc4ad8e70fa7 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('aab0f897-3ba7-41b9-9f27-fc4ad8e70fa7', '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB', 2, 'Assigned', 'Assigned', NOW(), NOW());

/* SQL text to insert entity field value with ID a4c7076b-7930-4cde-a8c7-d0b9294f1a95 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('a4c7076b-7930-4cde-a8c7-d0b9294f1a95', '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB', 3, 'None', 'None', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB';

/* SQL text to insert entity field value with ID 17829f93-6077-41ff-abeb-6314e9dc9b51 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('17829f93-6077-41ff-abeb-6314e9dc9b51', 'D8D0985D-B898-402A-83C8-E9816ACD3965', 1, 'Manage', 'Manage', NOW(), NOW());

/* SQL text to insert entity field value with ID ba8a2c87-f601-42b0-9b6f-501c52dc4e5e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ba8a2c87-f601-42b0-9b6f-501c52dc4e5e', 'D8D0985D-B898-402A-83C8-E9816ACD3965', 2, 'None', 'None', NOW(), NOW());

/* SQL text to insert entity field value with ID dd246eb2-c371-499f-8afe-ca1e4083573c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('dd246eb2-c371-499f-8afe-ca1e4083573c', 'D8D0985D-B898-402A-83C8-E9816ACD3965', 3, 'Read', 'Read', NOW(), NOW());

/* SQL text to insert entity field value with ID 571d6ba8-858c-4be7-a687-9e936d4e0158 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('571d6ba8-858c-4be7-a687-9e936d4e0158', 'D8D0985D-B898-402A-83C8-E9816ACD3965', 4, 'Search', 'Search', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID D8D0985D-B898-402A-83C8-E9816ACD3965 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='D8D0985D-B898-402A-83C8-E9816ACD3965';

/* SQL text to insert entity field value with ID 8e0cb348-84a3-4609-ae8b-7a6f11d11292 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('8e0cb348-84a3-4609-ae8b-7a6f11d11292', '8AF906F8-8E8C-423E-B7E9-6E2157823CAB', 1, 'Failure', 'Failure', NOW(), NOW());

/* SQL text to insert entity field value with ID 35425912-2085-45a3-b733-e85aa2758937 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('35425912-2085-45a3-b733-e85aa2758937', '8AF906F8-8E8C-423E-B7E9-6E2157823CAB', 2, 'Forbidden', 'Forbidden', NOW(), NOW());

/* SQL text to insert entity field value with ID 8eeda30e-d17c-43d1-895a-36c312330f75 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('8eeda30e-d17c-43d1-895a-36c312330f75', '8AF906F8-8E8C-423E-B7E9-6E2157823CAB', 3, 'Success', 'Success', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 8AF906F8-8E8C-423E-B7E9-6E2157823CAB */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='8AF906F8-8E8C-423E-B7E9-6E2157823CAB';


/* Create Entity Relationship: MJ: AI Agents -> MJ: AI Agent Search Scopes (One To Many via AgentID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'de60ca2a-4688-468a-b306-a6590a548dfc'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('de60ca2a-4688-468a-b306-a6590a548dfc', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'C1406BFB-9351-4BF5-966A-70B9A5D82166', 'AgentID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bfcc3a7f-eff1-420b-a634-6d936dcd9692'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('bfcc3a7f-eff1-420b-a634-6d936dcd9692', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '530982B5-5556-483A-A4D7-338A19E53548', 'AIAgentID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '857adbf3-cf9e-4519-bdd3-6dcbfa563202'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('857adbf3-cf9e-4519-bdd3-6dcbfa563202', '3F83C084-859F-49C3-A8A0-4693E0777BE8', '3B80A286-D1E1-45C2-9648-C850009E1ADB', 'SearchScopeID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f2384797-6006-40de-8162-7ff2093eb5dc'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f2384797-6006-40de-8162-7ff2093eb5dc', '3F83C084-859F-49C3-A8A0-4693E0777BE8', '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', 'SearchScopeID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f8b5d6f5-3ee9-4aaa-a22d-5e9e74f7ff00'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f8b5d6f5-3ee9-4aaa-a22d-5e9e74f7ff00', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'SearchScopeID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bf1651a6-39bf-4f0d-8409-ffb924b4b94e'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('bf1651a6-39bf-4f0d-8409-ffb924b4b94e', '3F83C084-859F-49C3-A8A0-4693E0777BE8', '20BCABEC-413F-4985-8F5A-6BC262E75F81', 'SearchScopeID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7a9867cc-2dda-4c7b-aa33-56664f687fd9'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('7a9867cc-2dda-4c7b-aa33-56664f687fd9', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'C1406BFB-9351-4BF5-966A-70B9A5D82166', 'SearchScopeID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd2332f0d-a8ab-4052-99e3-ea8e0a6261b2'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('d2332f0d-a8ab-4052-99e3-ea8e0a6261b2', '3F83C084-859F-49C3-A8A0-4693E0777BE8', '530982B5-5556-483A-A4D7-338A19E53548', 'SearchScopeID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7b3302fd-732c-4690-bb30-d16b463a4bc5'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('7b3302fd-732c-4690-bb30-d16b463a4bc5', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', 'SearchScopeID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6af9824c-45c4-4b99-8552-cceab712c5c3'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('6af9824c-45c4-4b99-8552-cceab712c5c3', '3F83C084-859F-49C3-A8A0-4693E0777BE8', '211DD116-32C7-43B4-B147-418F76B0E0E3', 'SearchScopeID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7574ad59-3af8-45f6-aa8c-12e192b589e3'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('7574ad59-3af8-45f6-aa8c-12e192b589e3', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'RoleID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '958ae369-3dc6-4a73-bdc5-8e98f498a463'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('958ae369-3dc6-4a73-bdc5-8e98f498a463', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '20BCABEC-413F-4985-8F5A-6BC262E75F81', 'EntityID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9ab2dba6-16dd-4c8c-bc83-b602e86ef7e6'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('9ab2dba6-16dd-4c8c-bc83-b602e86ef7e6', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'UserID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '654f7b16-491e-4c9a-993f-248b33d79f1b'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('654f7b16-491e-4c9a-993f-248b33d79f1b', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'OwnerUserID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c520ac63-b97e-468f-afc3-a99be76d7510'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('c520ac63-b97e-468f-afc3-a99be76d7510', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '530982B5-5556-483A-A4D7-338A19E53548', 'UserID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8e0008ce-d872-49d0-b23a-d1d04cf13199'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('8e0008ce-d872-49d0-b23a-d1d04cf13199', '1D248F34-2837-EF11-86D4-6045BDEE16E6', '3B80A286-D1E1-45C2-9648-C850009E1ADB', 'VectorIndexID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7f7a4713-ba43-4fc2-882a-272b9a831c0f'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('7f7a4713-ba43-4fc2-882a-272b9a831c0f', '48248F34-2837-EF11-86D4-6045BDEE16E6', 'C1406BFB-9351-4BF5-966A-70B9A5D82166', 'QueryTemplateID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5e1cd615-b0b2-46b1-97ff-d98948c7a34c'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('5e1cd615-b0b2-46b1-97ff-d98948c7a34c', '48248F34-2837-EF11-86D4-6045BDEE16E6', '211DD116-32C7-43B4-B147-418F76B0E0E3', 'QueryTransformTemplateID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bd7b4162-2883-4204-a6b9-ec95dcb26965'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('bd7b4162-2883-4204-a6b9-ec95dcb26965', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', 'FileStorageAccountID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0c10320a-859f-4de5-9d70-c22aa9db261e'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('0c10320a-859f-4de5-9d70-c22aa9db261e', 'C6923FA5-3F3D-4756-A2D8-E57125AF450F', '211DD116-32C7-43B4-B147-418F76B0E0E3', 'SearchProviderID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f7510fa4-6b65-4492-a7ff-2886af0fdd13' OR ("EntityID" = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND "Name" = 'SearchScope')
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
        'f7510fa4-6b65-4492-a7ff-2886af0fdd13',
        'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- "Entity": "MJ": "Search" "Scope" "Storage" "Accounts"
        100013,
        'SearchScope',
        'Search Scope',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ce151b90-76f1-4679-8032-de008596fa49' OR ("EntityID" = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND "Name" = 'FileStorageAccount')
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
        'ce151b90-76f1-4679-8032-de008596fa49',
        'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- "Entity": "MJ": "Search" "Scope" "Storage" "Accounts"
        100014,
        'FileStorageAccount',
        'File Storage Account',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2e1be192-9612-4edc-85ee-6a7f89ec9a6c' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'SearchScope')
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
        '2e1be192-9612-4edc-85ee-6a7f89ec9a6c',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100029,
        'SearchScope',
        'Search Scope',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6a4d5e34-5715-4978-b577-e962c2f3cf0f' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'User')
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
        '6a4d5e34-5715-4978-b577-e962c2f3cf0f',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100030,
        'User',
        'User',
        NULL,
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'af061599-4810-4876-a724-03ae4769d484' OR ("EntityID" = '530982B5-5556-483A-A4D7-338A19E53548' AND "Name" = 'AIAgent')
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
        'af061599-4810-4876-a724-03ae4769d484',
        '530982B5-5556-483A-A4D7-338A19E53548', -- "Entity": "MJ": "Search" "Execution" "Logs"
        100031,
        'AIAgent',
        'AI Agent',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '82dd578f-8fb6-4e05-a6fc-eae72a475096' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = 'SearchScope')
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
        '82dd578f-8fb6-4e05-a6fc-eae72a475096',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
        100019,
        'SearchScope',
        'Search Scope',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44bda962-5405-497c-b4a3-9a38df89e73e' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = 'SearchProvider')
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
        '44bda962-5405-497c-b4a3-9a38df89e73e',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
        100020,
        'SearchProvider',
        'Search Provider',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3de74202-a1db-4ad3-b5a3-ff83e19fd97e' OR ("EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND "Name" = 'QueryTransformTemplate')
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
        '3de74202-a1db-4ad3-b5a3-ff83e19fd97e',
        '211DD116-32C7-43B4-B147-418F76B0E0E3', -- "Entity": "MJ": "Search" "Scope" "Providers"
        100021,
        'QueryTransformTemplate',
        'Query Transform Template',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd1f7137f-1b2a-4b12-8569-7ec20ed05c96' OR ("EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND "Name" = 'OwnerUser')
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
        'd1f7137f-1b2a-4b12-8569-7ec20ed05c96',
        '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- "Entity": "MJ": "Search" "Scopes"
        100031,
        'OwnerUser',
        'Owner User',
        NULL,
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2d862b18-1d7d-4701-83c6-7b7c3f79e81b' OR ("EntityID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND "Name" = 'SearchScope')
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
        '2d862b18-1d7d-4701-83c6-7b7c3f79e81b',
        '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- "Entity": "MJ": "Search" "Scope" "Entities"
        100015,
        'SearchScope',
        'Search Scope',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1fe5aeb5-4c21-4381-b45e-4ab5384888ea' OR ("EntityID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND "Name" = 'Entity')
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
        '1fe5aeb5-4c21-4381-b45e-4ab5384888ea',
        '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- "Entity": "MJ": "Search" "Scope" "Entities"
        100016,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0b7edc6f-322c-4933-925d-567e07d8c11a' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'Agent')
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
        '0b7edc6f-322c-4933-925d-567e07d8c11a',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100031,
        'Agent',
        'Agent',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0c7c0308-f079-4515-94f0-d9587fae1414' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'SearchScope')
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
        '0c7c0308-f079-4515-94f0-d9587fae1414',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100032,
        'SearchScope',
        'Search Scope',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'db588640-89aa-4b25-8523-99b9c973785b' OR ("EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND "Name" = 'QueryTemplate')
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
        'db588640-89aa-4b25-8523-99b9c973785b',
        'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- "Entity": "MJ": "AI" "Agent" "Search" "Scopes"
        100033,
        'QueryTemplate',
        'Query Template',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bf618893-6689-4ee2-bbdf-f1dcc7854f86' OR ("EntityID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND "Name" = 'SearchScope')
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
        'bf618893-6689-4ee2-bbdf-f1dcc7854f86',
        '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- "Entity": "MJ": "Search" "Scope" "Test" "Queries"
        100019,
        'SearchScope',
        'Search Scope',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8da3d87d-9dec-430b-9e99-e738b2302065' OR ("EntityID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND "Name" = 'SearchScope')
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
        '8da3d87d-9dec-430b-9e99-e738b2302065',
        'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- "Entity": "MJ": "Search" "Scope" "Permissions"
        100015,
        'SearchScope',
        'Search Scope',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f7e0fbca-028a-4610-aaf4-30ca6a439252' OR ("EntityID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND "Name" = 'User')
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
        'f7e0fbca-028a-4610-aaf4-30ca6a439252',
        'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- "Entity": "MJ": "Search" "Scope" "Permissions"
        100016,
        'User',
        'User',
        NULL,
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '62e49f65-1aa6-40f0-84b8-1a65d8ceac06' OR ("EntityID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND "Name" = 'Role')
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
        '62e49f65-1aa6-40f0-84b8-1a65d8ceac06',
        'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- "Entity": "MJ": "Search" "Scope" "Permissions"
        100017,
        'Role',
        'Role',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a8793f0e-c9b5-498e-b858-3ab08f986555' OR ("EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND "Name" = 'SearchScope')
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
        'a8793f0e-c9b5-498e-b858-3ab08f986555',
        '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- "Entity": "MJ": "Search" "Scope" "External" "Indexes"
        100019,
        'SearchScope',
        'Search Scope',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cc70b68e-3800-4c66-9827-70dde27fa50e' OR ("EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND "Name" = 'VectorIndex')
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
        'cc70b68e-3800-4c66-9827-70dde27fa50e',
        '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- "Entity": "MJ": "Search" "Scope" "External" "Indexes"
        100020,
        'VectorIndex',
        'Vector Index',
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
               SET "IsNameField" = TRUE
               WHERE "ID" = '82DD578F-8FB6-4E05-A6FC-EAE72A475096'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '44BDA962-5405-497C-B4A3-9A38DF89E73E'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F66D6720-E1E5-48AA-934F-7C2B3784EF0D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B907068F-ABD3-43A1-BF34-820CD089BC9D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '82DD578F-8FB6-4E05-A6FC-EAE72A475096'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '44BDA962-5405-497C-B4A3-9A38DF89E73E'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '82DD578F-8FB6-4E05-A6FC-EAE72A475096'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '44BDA962-5405-497C-B4A3-9A38DF89E73E'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '82DD578F-8FB6-4E05-A6FC-EAE72A475096'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '44BDA962-5405-497C-B4A3-9A38DF89E73E'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '8DA3D87D-9DEC-430B-9E99-E738B2302065'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'F7E0FBCA-028A-4610-AAF4-30CA6A439252'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '62E49F65-1AA6-40F0-84B8-1A65D8CEAC06'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D8D0985D-B898-402A-83C8-E9816ACD3965'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '8DA3D87D-9DEC-430B-9E99-E738B2302065'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F7E0FBCA-028A-4610-AAF4-30CA6A439252'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '62E49F65-1AA6-40F0-84B8-1A65D8CEAC06'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '8DA3D87D-9DEC-430B-9E99-E738B2302065'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'F7E0FBCA-028A-4610-AAF4-30CA6A439252'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '62E49F65-1AA6-40F0-84B8-1A65D8CEAC06'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'F7510FA4-6B65-4492-A7FF-2886AF0FDD13'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'CE151B90-76F1-4679-8032-DE008596FA49'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '6255F1D5-A755-4355-A34C-CF89E18F4BA6'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F7510FA4-6B65-4492-A7FF-2886AF0FDD13'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'CE151B90-76F1-4679-8032-DE008596FA49'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '6255F1D5-A755-4355-A34C-CF89E18F4BA6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'F7510FA4-6B65-4492-A7FF-2886AF0FDD13'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'CE151B90-76F1-4679-8032-DE008596FA49'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'F7510FA4-6B65-4492-A7FF-2886AF0FDD13'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'CE151B90-76F1-4679-8032-DE008596FA49'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '84D4B55F-4270-4C1A-8E3E-B5F6E8879B5B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A4A044AB-961D-4100-8E92-7BB10F8433CD'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'CEE83CDC-CD11-4B85-8CA0-9F5841CC883F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D1F7137F-1B2A-4B12-8569-7EC20ED05C96'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '7C71AB7F-5318-42C6-B34F-5D6EF4462C90'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'B01CC6B5-03A8-46D2-8C7F-B6F9DBB4FEF2'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '2D862B18-1D7D-4701-83C6-7B7C3F79E81B'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '1FE5AEB5-4C21-4381-B45E-4AB5384888EA'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '94F3FC15-08C6-4FE2-AC3B-D234DFFFABBE'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '2D862B18-1D7D-4701-83C6-7B7C3F79E81B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '1FE5AEB5-4C21-4381-B45E-4AB5384888EA'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '2D862B18-1D7D-4701-83C6-7B7C3F79E81B'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '1FE5AEB5-4C21-4381-B45E-4AB5384888EA'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '2D862B18-1D7D-4701-83C6-7B7C3F79E81B'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '1FE5AEB5-4C21-4381-B45E-4AB5384888EA'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = FALSE
            WHERE "ID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '0B7EDC6F-322C-4933-925D-567E07D8C11A'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '0C7C0308-F079-4515-94F0-D9587FAE1414'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E6EF21B2-CB3C-4D05-8A73-65C55897468C'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '301FFE95-1405-4200-85C0-E2EE4BADDE99'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '44A7C7B2-7C8A-4199-A08D-C068DF677E6B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '0B7EDC6F-322C-4933-925D-567E07D8C11A'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '0C7C0308-F079-4515-94F0-D9587FAE1414'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'E6EF21B2-CB3C-4D05-8A73-65C55897468C'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '0B7EDC6F-322C-4933-925D-567E07D8C11A'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '0C7C0308-F079-4515-94F0-D9587FAE1414'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'E6EF21B2-CB3C-4D05-8A73-65C55897468C'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'A8793F0E-C9B5-498E-B858-3AB08F986555'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5D7F70E8-E16B-48A7-B0F7-B29355040E84'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '7F0CBAB5-D960-4621-BB6E-CBC0340F4968'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A8793F0E-C9B5-498E-B858-3AB08F986555'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'CC70B68E-3800-4C66-9827-70DDE27FA50E'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '5D7F70E8-E16B-48A7-B0F7-B29355040E84'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '7F0CBAB5-D960-4621-BB6E-CBC0340F4968'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'A8793F0E-C9B5-498E-B858-3AB08F986555'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '5D7F70E8-E16B-48A7-B0F7-B29355040E84'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '3A38C86B-90E6-4B6B-84BD-505F5C079E12'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '3A38C86B-90E6-4B6B-84BD-505F5C079E12'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '6DE3B564-29DA-4A88-A1EA-FD968E86108D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '3F4DDA5D-0D6B-43AD-A9A6-6569E8038C78'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'BF618893-6689-4EE2-BBDF-F1DCC7854F86'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '3A38C86B-90E6-4B6B-84BD-505F5C079E12'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '6DE3B564-29DA-4A88-A1EA-FD968E86108D'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'BF618893-6689-4EE2-BBDF-F1DCC7854F86'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '3A38C86B-90E6-4B6B-84BD-505F5C079E12'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'BF618893-6689-4EE2-BBDF-F1DCC7854F86'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '13617353-79F1-409B-AA4F-9FD96A5A7AAD'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '13617353-79F1-409B-AA4F-9FD96A5A7AAD'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '8AF906F8-8E8C-423E-B7E9-6E2157823CAB'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '475FC885-98CA-43A9-89BB-88CD64531C98'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '2E1BE192-9612-4EDC-85EE-6A7F89EC9A6C'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '6A4D5E34-5715-4978-B577-E962C2F3CF0F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '13617353-79F1-409B-AA4F-9FD96A5A7AAD'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '8AF906F8-8E8C-423E-B7E9-6E2157823CAB'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '2E1BE192-9612-4EDC-85EE-6A7F89EC9A6C'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '6A4D5E34-5715-4978-B577-E962C2F3CF0F'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'AF061599-4810-4876-A724-03AE4769D484'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '2E1BE192-9612-4EDC-85EE-6A7F89EC9A6C'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '6A4D5E34-5715-4978-B577-E962C2F3CF0F'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'AF061599-4810-4876-A724-03AE4769D484'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '8AF906F8-8E8C-423E-B7E9-6E2157823CAB'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0DFCF074-13A3-4068-B5D9-6032D424D112' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts."SearchScopeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Scope Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '32221C7E-325D-4AFB-B7A5-3B0F5F52834D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts."SearchScope"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Scope Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F7510FA4-6B65-4492-A7FF-2886AF0FDD13' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts."FileStorageAccountID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Storage Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Storage Account',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BD032D1E-1B51-48BA-ACE1-AEF987C7F7AB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts."FileStorageAccount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Storage Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Storage Account Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CE151B90-76F1-4679-8032-DE008596FA49' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts."FolderPath"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Storage Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6255F1D5-A755-4355-A34C-CF89E18F4BA6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3197E4B7-B5EC-4CEF-B6F7-BFCE3B292F53' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5B6805C1-BBD9-47E1-A678-6C9525AC5449' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-folder-open */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-folder-open', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('7f0ed9a7-2d9d-4225-8ff8-c4fd543072f0', 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', 'FieldCategoryInfo', '{"Scope Configuration":{"icon":"fa fa-search","description":"Links the storage account to a specific search scope context"},"Storage Configuration":{"icon":"fa fa-hdd","description":"Details regarding the file storage account and optional folder path restrictions"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('8712171c-eb71-4931-bce1-212aa3b03e82', 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', 'FieldCategoryIcons', '{"Scope Configuration":"fa fa-search","Storage Configuration":"fa fa-hdd","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2';

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope Entities."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1BD7C23C-8241-4E1A-B247-A8F14E32BC19' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Entities."SearchScope"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Scope Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2D862B18-1D7D-4701-83C6-7B7C3F79E81B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Entities."SearchScopeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Scope Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EDBC9655-6E2E-42AF-BF84-AED9DA27C950' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Entities."Entity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Entity Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1FE5AEB5-4C21-4381-B45E-4AB5384888EA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Entities."EntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Entity Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '04D1E6AB-0EA1-44F8-932A-56359CEA29B6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Entities."ExtraFilter"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Logic',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '94F3FC15-08C6-4FE2-AC3B-D234DFFFABBE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Entities."UserSearchString"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Logic',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '441D9670-AE89-4F60-AA1F-559E58B84CA0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Entities.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '32B349A9-34AE-4FF5-9381-8B8B3B713488' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Entities.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '894D9770-E13A-4574-9742-6B763EDDA34D' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-search */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-search', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('be9b1b19-1582-458c-9269-7fb90b9d35bf', '20BCABEC-413F-4985-8F5A-6BC262E75F81', 'FieldCategoryInfo', '{"Scope Configuration":{"icon":"fa fa-crosshairs","description":"Defines the high-level search scope and its identifier"},"Entity Configuration":{"icon":"fa fa-database","description":"Maps specific entities to the search scope"},"Search Logic":{"icon":"fa fa-code","description":"Advanced technical configurations for filtering and query overrides"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('a28110bf-7c31-488e-a076-a5604d08a0d1', '20BCABEC-413F-4985-8F5A-6BC262E75F81', 'FieldCategoryIcons', '{"Scope Configuration":"fa fa-crosshairs","Entity Configuration":"fa fa-database","Search Logic":"fa fa-code","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '20BCABEC-413F-4985-8F5A-6BC262E75F81';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope Permissions."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A65342F4-8289-4FE8-84E0-B0AD6ABBF27E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Permissions."SearchScopeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Permission Scope',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3F4D48AC-A66F-4ADF-9DFE-9931EDA4B876' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Permissions."SearchScope"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Permission Scope',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8DA3D87D-9DEC-430B-9E99-E738B2302065' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Permissions."PermissionLevel"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Permission Scope',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8D0985D-B898-402A-83C8-E9816ACD3965' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Permissions."UserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Grantee Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0B6000C0-2ADA-462A-95DB-347997D1B7DD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Permissions."User"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Grantee Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F7E0FBCA-028A-4610-AAF4-30CA6A439252' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Permissions."RoleID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Grantee Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Role',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '806A6BEF-8E3A-4957-B122-DD08B62727D2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Permissions."Role"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Grantee Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Role Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '62E49F65-1AA6-40F0-84B8-1A65D8CEAC06' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '30576DD7-1752-48BD-85B1-D9655BBB055F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '26A95BD0-FF2E-420C-AFCE-F005811F1E47' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-shield-alt */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-shield-alt', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('1857ef52-e2da-4c70-a38c-b715414f8542', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'FieldCategoryInfo', '{"Permission Scope":{"icon":"fa fa-search","description":"Defines the search scope and the level of access granted."},"Grantee Information":{"icon":"fa fa-user-shield","description":"Specifies the individual user or role receiving the permission."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('47639fd2-ab67-4de6-b5ba-0446c61910ca', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'FieldCategoryIcons', '{"Permission Scope":"fa fa-search","Grantee Information":"fa fa-user-shield","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7A8D248C-CA1C-4851-9B30-C2F39950D0F0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes."SearchScopeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Scope Identification',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C7B0E695-7A9D-4D36-A860-CAA0FE743A93' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes."SearchScope"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Scope Identification',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A8793F0E-C9B5-498E-B858-3AB08F986555' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes."IndexType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Index Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5D7F70E8-E16B-48A7-B0F7-B29355040E84' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes."VectorIndexID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Index Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CC4C6581-35DE-4B31-9049-4F385E83DAA4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes."VectorIndex"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Index Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CC70B68E-3800-4C66-9827-70DDE27FA50E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes."ExternalIndexName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Index Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7F0CBAB5-D960-4621-BB6E-CBC0340F4968' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes."ExternalIndexConfig"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Advanced Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '8405E520-F9CC-45A0-86FA-62BA702B706A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes."MetadataFilter"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Advanced Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '5494CA26-73E8-47E9-A35F-7CCD0AEBAA28' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6FBBBD9F-D8F3-4E8A-A8D7-BFEC6CE6FE73' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '062CBF53-A21B-46DE-9BCE-4A2E0CB5C621' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-search-plus */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-search-plus', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('a9c14c43-af95-4a81-83ce-18e863490e37', '3B80A286-D1E1-45C2-9648-C850009E1ADB', 'FieldCategoryInfo', '{"Scope Identification":{"icon":"fa fa-tag","description":"Core identification fields for the search scope entity"},"Index Configuration":{"icon":"fa fa-database","description":"Technical settings defining the search provider and index target"},"Advanced Settings":{"icon":"fa fa-code","description":"JSON-based configuration and filtering logic for advanced integration"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('66368205-682c-4d4f-9664-735a4405e862', '3B80A286-D1E1-45C2-9648-C850009E1ADB', 'FieldCategoryIcons', '{"Scope Identification":"fa fa-tag","Index Configuration":"fa fa-database","Advanced Settings":"fa fa-code","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '3B80A286-D1E1-45C2-9648-C850009E1ADB';

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope Providers."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C14A9B8E-7DC2-4EE8-865A-CB9E310DF2E5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Providers."SearchScopeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Association',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '451A3F52-A5DF-4099-8BC0-E3588C9220AC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Providers."SearchScope"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Association',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '82DD578F-8FB6-4E05-A6FC-EAE72A475096' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Providers."SearchProviderID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Association',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Provider',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '95740918-B09C-4EEB-A612-352BEE7B4D1C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Providers."SearchProvider"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Provider Association',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Provider Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '44BDA962-5405-497C-B4A3-9A38DF89E73E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Providers."Enabled"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F66D6720-E1E5-48AA-934F-7C2B3784EF0D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Providers."MaxResultsOverride"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B907068F-ABD3-43A1-BF34-820CD089BC9D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Providers."ProviderConfigOverride"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'AFFA4EA1-E4A3-4E9A-99CC-D9AFFAEFA432' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Providers."QueryTransformTemplateID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Query Transformation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Query Transform Template',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '58E855E8-F804-4A0E-B0AC-722EC76941D8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Providers."QueryTransformTemplate"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Query Transformation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Query Transform Template Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3DE74202-A1DB-4AD3-B5A3-FF83E19FD97E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Providers.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1F94A390-0411-4581-AEF7-5384B72EE79D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Providers.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3EFD97CC-7FFA-4A58-A5B7-B31E44FBEF36' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-search-plus */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-search-plus', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '211DD116-32C7-43B4-B147-418F76B0E0E3';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('b7e43577-9fa2-4cf2-92c0-3a2fd50bc14b', '211DD116-32C7-43B4-B147-418F76B0E0E3', 'FieldCategoryInfo', '{"Provider Association":{"icon":"fa fa-link","description":"Links and descriptive names identifying the search scope and provider relationship"},"Configuration Settings":{"icon":"fa fa-sliders-h","description":"Operational settings for enabling providers and overriding default behaviors"},"Query Transformation":{"icon":"fa fa-magic","description":"Settings for rewriting user queries before they reach the provider"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('b7a4b0ab-2d67-4ee9-83ac-8c2abb4e0d5a', '211DD116-32C7-43B4-B147-418F76B0E0E3', 'FieldCategoryIcons', '{"Provider Association":"fa fa-link","Configuration Settings":"fa fa-sliders-h","Query Transformation":"fa fa-magic","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '211DD116-32C7-43B4-B147-418F76B0E0E3';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3F2103B7-2FCF-4BBC-AEA2-C53A0BBD3822' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries."SearchScopeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CFE7D72F-79D3-4AA9-8469-207C2151C14B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries."SearchScope"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BF618893-6689-4EE2-BBDF-F1DCC7854F86' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries."Label"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Query Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3A38C86B-90E6-4B6B-84BD-505F5C079E12' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries."Query"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Query Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '6DE3B564-29DA-4A88-A1EA-FD968E86108D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries."Notes"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Query Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E4ADE8DA-300C-4A10-A142-9680F9882D7C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries."ExpectedTopResultEntity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Validation Criteria',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A8DE8947-B323-4098-9FE6-E06CA34C80C5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries."ExpectedTopResultRecordID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Validation Criteria',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D75CFA63-3B07-4F40-BB28-47C5365DFEDA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '923C5D6D-BED9-4550-929A-83CD2FF44C0A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3F4DDA5D-0D6B-43AD-A9A6-6569E8038C78' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-search */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-search', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('bb01cb91-24c9-493e-9836-c4785bd1110d', '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', 'FieldCategoryInfo', '{"Search Configuration":{"icon":"fa fa-cogs","description":"Links and references to the Search Scope being tuned."},"Query Definition":{"icon":"fa fa-search","description":"The specific query text and descriptive labels for the test case."},"Validation Criteria":{"icon":"fa fa-check-circle","description":"Expected outcomes used to validate search performance and regression."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields."}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('91b9f30b-6e1e-4b26-8f62-9f03cc73888e', '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', 'FieldCategoryIcons', '{"Search Configuration":"fa fa-cogs","Query Definition":"fa fa-search","Validation Criteria":"fa fa-check-circle","System Metadata":"fa fa-database"}', NOW(), NOW());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Search Scopes."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CF722ABD-E0AC-4791-A694-1A5C308844A2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'General Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B01CC6B5-03A8-46D2-8C7F-B6F9DBB4FEF2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'General Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7C71AB7F-5318-42C6-B34F-5D6EF4462C90' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."Icon"

UPDATE __mj."EntityField"
SET 
   "Category" = 'General Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C639CB34-93B2-45FD-A8B6-197F01F30DA3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."IsGlobal"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Scope Behavior',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '84D4B55F-4270-4C1A-8E3E-B5F6E8879B5B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."IsDefault"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Scope Behavior',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A4A044AB-961D-4100-8E92-7BB10F8433CD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."OwnerUserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Access Control',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A515DCD2-C9CD-471F-A6F2-2DB35D3C5C03' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."OwnerUser"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Access Control',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D1F7137F-1B2A-4B12-8569-7EC20ED05C96' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Lifecycle and Availability',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CEE83CDC-CD11-4B85-8CA0-9F5841CC883F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."StartAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Lifecycle and Availability',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '030DF56E-9DF6-4E5A-AE54-6C00C09356C5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."EndAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Lifecycle and Availability',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0262FC04-F9A2-42BF-A0A4-7028BF1AE80E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."ScopeConfig"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Scope Configuration',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '9641CA58-B2DF-48CE-B3AC-976C9E7F63D1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."SearchContextConfig"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Context Configuration',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '7183A757-830F-482E-9E41-77E5E641B814' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes."RerankerBudgetCents"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Reranker Budget (Cents)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9DEA41DD-E375-4D15-9A9A-4136FFC35194' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B481EDF6-17D5-4DEE-925C-FE300EEF446F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Scopes.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DAAC5CC2-1733-4E8A-9510-DF26DD36D2F7' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-search-plus */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-search-plus', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('20e1b1e3-97b7-4dd2-a64b-7872474edbe1', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'FieldCategoryInfo', '{"General Information":{"icon":"fa fa-info-circle","description":"Core descriptive fields for identifying the search scope"},"Scope Behavior":{"icon":"fa fa-toggle-on","description":"Settings that define how the scope interacts with the system defaults"},"Access Control":{"icon":"fa fa-lock","description":"Visibility and ownership settings for the search scope"},"Lifecycle and Availability":{"icon":"fa fa-calendar-alt","description":"Time-based activation and operational status settings"},"Configuration":{"icon":"fa fa-cogs","description":"Advanced technical parameters and JSON configurations"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('1a1abd9d-3293-4a09-a7ba-32a88e0e028d', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'FieldCategoryIcons', '{"General Information":"fa fa-info-circle","Scope Behavior":"fa fa-toggle-on","Access Control":"fa fa-lock","Lifecycle and Availability":"fa fa-calendar-alt","Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}', NOW(), NOW());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '3F83C084-859F-49C3-A8A0-4693E0777BE8';

/* Set categories for 18 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F68EC93D-8CB6-4D35-881C-0DCCD4E42DB6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."AgentID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Assignment Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A2E7A5D8-B241-48FA-B0AD-979DAE320266' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."SearchScopeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Assignment Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C0E907E7-044E-4298-9BBE-7A2387B855F4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."Agent"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Assignment Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0B7EDC6F-322C-4933-925D-567E07D8C11A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."SearchScope"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Assignment Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0C7C0308-F079-4515-94F0-D9587FAE1414' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."Phase"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Control',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Execution Phase',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E6EF21B2-CB3C-4D05-8A73-65C55897468C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."IsDefault"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Control',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Default Scope',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '44A7C7B2-7C8A-4199-A08D-C068DF677E6B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."Priority"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '301FFE95-1405-4200-85C0-E2EE4BADDE99' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."StartAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Timeline',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C42E55CF-DA62-47F7-9CDC-BAF87CF00CFB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."EndAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Timeline',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E12BF45E-E0CD-4188-A221-82C9FC22EBB2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."MaxResults"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '543F7E2C-80E0-4024-9167-667616359F68' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."MinScore"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Minimum Score',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2EEC11CA-4F71-4AEF-AC50-97F2372C93B1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."QueryTemplateID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Query Template',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E8E32952-3858-475F-BFB6-C918D181D270' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."QueryTemplate"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Query Template Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DB588640-89AA-4B25-8523-99B9C973785B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes."FusionWeightsOverride"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'B5CE6D24-4C59-4BBB-B2F6-E8F0FFBEDD40' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A6522A09-72F4-472B-9601-1FC16D475DDC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6AD7C7CF-B0E7-4D59-898D-0DF744F6ABE7' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-search-plus */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-search-plus', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166';

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Search Execution Logs."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4322AA22-D7BC-485D-9196-3D5B6DE3185D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."SearchScopeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F0497A66-B889-4B67-BF77-1BB7A21754CF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."SearchScope"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Search Scope Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2E1BE192-9612-4EDC-85EE-6A7F89EC9A6C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."UserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Initiator Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '17D7AB0C-2ECC-4BED-9618-DD92F465D25B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."User"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Initiator Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6A4D5E34-5715-4978-B577-E962C2F3CF0F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."AIAgentID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Initiator Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'AI Agent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6AC56098-A8C6-432D-A5A2-2C8C40E5AD1D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."AIAgent"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Initiator Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'AI Agent Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AF061599-4810-4876-A724-03AE4769D484' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."Query"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Execution',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '13617353-79F1-409B-AA4F-9FD96A5A7AAD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."TotalDurationMs"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Execution',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Total Duration (ms)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FF77DD4A-6BFC-4AE3-9E61-039D9B96941F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."ResultCount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Execution',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C5906C5C-B5BC-48B2-A819-746CD09E913B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Execution',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8AF906F8-8E8C-423E-B7E9-6E2157823CAB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."FailureReason"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Execution',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9D69E7A8-1917-4231-A697-A5A5C9788D0E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."RerankerName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Reranker Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CCB15200-656C-4EA2-972D-34F48F9F78E4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."RerankerCostCents"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Reranker Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Reranker Cost (Cents)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '72BEE633-F344-4BB1-874B-93E551AE60DA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs."ProvidersJSON"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Execution',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Providers Breakdown',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '3F7FCEEC-BE05-4AD3-B4C2-998C087DCA75' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '475FC885-98CA-43A9-89BB-88CD64531C98' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Search Execution Logs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5EB11D11-E68B-407A-B681-BF711F646638' AND "AutoUpdateCategory" = TRUE;

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('433e53ff-de77-42a3-9040-cfd3e6f36776', 'C1406BFB-9351-4BF5-966A-70B9A5D82166', 'FieldCategoryInfo', '{"Assignment Details":{"icon":"fa fa-link","description":"Core relationships linking agents to their specific search scopes"},"Execution Control":{"icon":"fa fa-sliders-h","description":"Settings governing when and how the scope is triggered during agent execution"},"Timeline":{"icon":"fa fa-calendar-alt","description":"Time-based activation and expiry windows for this assignment"},"Search Configuration":{"icon":"fa fa-cogs","description":"Technical overrides for search behavior including results, scoring, and query templates"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('748e98da-86d5-4918-a92e-25bc0c909ba5', 'C1406BFB-9351-4BF5-966A-70B9A5D82166', 'FieldCategoryIcons', '{"Assignment Details":"fa fa-link","Execution Control":"fa fa-sliders-h","Timeline":"fa fa-calendar-alt","Search Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}', NOW(), NOW());

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'C1406BFB-9351-4BF5-966A-70B9A5D82166';

/* Set entity icon to fa fa-search */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-search', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '530982B5-5556-483A-A4D7-338A19E53548';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('3076cf33-59d0-4d8e-82f7-aa434659a0e7', '530982B5-5556-483A-A4D7-338A19E53548', 'FieldCategoryInfo', '{"Search Context":{"icon":"fa fa-map-marker-alt","description":"Information regarding the scope and context of the search"},"Initiator Details":{"icon":"fa fa-user-circle","description":"Details about the user or AI agent who triggered the search"},"Search Execution":{"icon":"fa fa-tachometer-alt","description":"Performance metrics, outcomes, and raw data from the search invocation"},"Reranker Details":{"icon":"fa fa-sliders-h","description":"Information regarding the reranking stage of the search"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('a4d42fa1-f910-4fe9-bbbe-c87206cfef51', '530982B5-5556-483A-A4D7-338A19E53548', 'FieldCategoryIcons', '{"Search Context":"fa fa-map-marker-alt","Initiator Details":"fa fa-user-circle","Search Execution":"fa fa-tachometer-alt","Reranker Details":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '530982B5-5556-483A-A4D7-338A19E53548';

/* Set categories for 74 fields */

-- UPDATE Entity Field Category Info MJ: AI Agents."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AA64DA98-1DA1-4525-8CC5-BC3E3E4893B6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."LogoURL"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = '77845738-5781-458B-AD3C-5DAE745373C2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."TypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '91CA077D-3F59-48E1-A593-AF8686276115' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."DriverClass"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB9AD9CB-40C0-41F1-B54B-750C844FD41B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."IconClass"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E3E05E29-CDAF-4BFE-9FC8-4450EEBE05E5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ModelSelectionMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FEEBD49D-5572-45D7-9F1E-08AE762F41D9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultArtifactTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F58EA638-CE95-4D2A-9095-9909149B83C7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."OwnerUserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ArtifactCreationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4371BED0-7C4A-4D24-9E07-17E15D617607' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."FunctionalRequirements"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F613597C-C38F-4D71-B64A-8BBCFD87D8CC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."TechnicalDesign"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CAEA2872-B089-4192-8FA8-1737FF357FFD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."IsRestricted"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E5B17B79-282F-4F19-9656-246DE119D588' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AgentTypePromptParams"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Prompt Parameters',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD515BF1-7E8A-4CB0-A8CE-D5C0C8C132D7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."CategoryID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7DCA7B3C-9A81-4D32-AF2E-5EA32B22D988' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultArtifactType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C1C76DF-BBFF-4903-9BB9-3325B5ABB4B1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."OwnerUser"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B098B41F-7953-473E-8257-DB6BFFEF48A0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6517DB09-A12E-4F1B-95B6-0B0A92918A1D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '353D4710-73B2-4AF5-8A93-9DC1F47FF6E5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3177830D-10A0-4003-B95D-8514974BA846' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent Agent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A6F8773F-4021-45DD-B142-9BFE4F67EC87' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ExposeAsAction"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DF61AC7C-79A7-4058-96A1-85EBA9339D45' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ExecutionOrder"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '090830CE-4073-486C-BBF2-E2105BEADD91' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ExecutionMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8261D630-2560-4C03-BE14-C8A9682ABBB4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."InvocationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Parent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '52E74C81-D246-4B52-B7A7-91757C299671' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."RootParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '644AA4B2-1044-430C-BCBA-245644294E02' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."EnableContextCompression"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '09AFE563-63E3-4F2B-B6F1-5945432FF07B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionMessageThreshold"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Message Threshold',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '451D5C8F-6749-4789-A158-658B38A74AE4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionPromptID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Compression Prompt',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FFD209C5-48F3-45D1-9094-E76EC832EA07' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionMessageRetentionCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Retention Count',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '73A50D68-976F-49A7-9737-12D1D26C6011' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionPrompt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Compression Prompt Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AD36EF69-1494-409C-A97E-FE73669DD28A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadDownstreamPaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Downstream Paths',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '85B6AA86-796D-4970-9E35-5A483498B517' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadUpstreamPaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Upstream Paths',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DA784B76-66CD-434B-90BD-DEC808917E68' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadSelfReadPaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Self Read Paths',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EBF3B958-F07C-420B-82BE-2CB1E396A0F5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadSelfWritePaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Self Write Paths',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '61E51FC3-8EFA-40D9-9525-F3FAD0A95DCA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadScope"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2E542986-0164-4B9E-8457-06826A4AB892' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."FinalPayloadValidation"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1C7959AE-F48B-4858-8383-28C3F4706314' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."FinalPayloadValidationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Final Validation Mode',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8931DE12-4048-4DEB-A2A3-E821354CFFB2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."FinalPayloadValidationMaxRetries"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Max Validation Retries',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AF62DAAB-74D4-4539-9B47-58DD4A023E4B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."StartingPayloadValidation"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B7A2371C-A22C-48EA-827E-824F8A40DA3D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."StartingPayloadValidationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Starting Validation Mode',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0947203D-A5CA-4ED2-895B-17A8007323FC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."InjectNotes"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '37E075BD-CC4B-4AE1-8D12-7EC45B663F69' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxNotesToInject"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Max Notes to Inject',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A8DA4C67-B2F7-4C1D-8522-A2B5B4BADA21' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."NoteInjectionStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F5F6BE87-06F4-404D-A1C3-B315C562C32B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."InjectExamples"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1C9957C7-A851-4C05-83B3-F49A5FC3FE4D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxExamplesToInject"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Max Examples to Inject',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DDEE3E91-4B0D-4264-9EF1-ACAAB8D105E5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ExampleInjectionStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '291FEE7A-1245-4C82-A470-07EEB8847F1E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxCostPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '23850C5A-311A-4271-AE53-BD36921C5AA5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxTokensPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C5F8BB50-DC10-4DFC-AC45-8613C152EE94' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxIterationsPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3FA6B9F3-60BC-4631-8EB4-7ED0D04844C4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxTimePerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E64A4FF8-BAD5-491C-9D8D-E5E70378ED67' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MinExecutionsPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BCCCA2DC-8A15-4701-98E2-337FB60B463A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxExecutionsPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F0CCA759-DEA4-4F61-B233-C632EE9317E1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultPromptEffortLevel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Effort Level',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DCBAEEFD-C5A2-449D-A4B9-EAB1290C2F89' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ChatHandlingOption"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MessageMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '445C1618-EADB-4B34-B318-40C662141FE1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxMessages"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F8924303-D53A-43B0-B70F-5B74FA6248D9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AllowEphemeralClientTools"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Allow Ephemeral Tools',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '98BE9EE9-A855-488E-9D97-441AEBA2B34D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AttachmentStorageProviderID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Storage Provider',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B5A24CC-1BC2-40E3-B83E-C8E164E6CFED' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AttachmentRootPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Path',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BA112220-B0D8-4C6F-B63A-027EB706B132' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."InlineStorageThresholdBytes"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Inline Storage Threshold',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EC3D6539-FAF4-49B7-9A9B-6327249C9D06' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AttachmentStorageProvider"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Storage Provider Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B6261245-1F52-43BA-9C92-A3E494D8C5BE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultStorageAccountID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Attachment Storage',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Storage Account',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '76AF4818-C79E-4DB5-8039-6B51C1C3A832' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultStorageAccount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Attachment Storage',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Storage Account Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D900C3B8-F414-4468-AAA1-3CEB52C80ACD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ScopeConfig"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F644A0DD-0C7D-44E5-A2D5-0DAE4F0455AD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."NoteRetentionDays"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '38ABFFF6-5E0D-4AF1-B5CC-AB46B2358FB4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ExampleRetentionDays"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A112A808-63DB-4B48-B38F-06554B912DED' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AutoArchiveEnabled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '85774265-68C5-4067-9C2B-F70A7F21B94A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."RerankerConfiguration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '269087F5-DEBE-4B14-8FA3-5938ADCF7325' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."SearchScopeAccess"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Retrieval & Ranking',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB' AND "AutoUpdateCategory" = TRUE;

/* Generated Validation Functions for MJ: Search Scope External Indexes */
-- CHECK constraint for MJ: Search Scope External Indexes @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', NOW(), 'TypeScript','Approved', '([IndexType]=''Vector'' AND [VectorIndexID] IS NOT NULL OR [IndexType]<>''Vector'' AND [ExternalIndexName] IS NOT NULL)', 'public ValidateIndexTypeRequirements(result: ValidationResult) {
	// If the index is a Vector type, ensure a Vector Index ID is provided
	if (this."IndexType" === ''Vector'' && this."VectorIndexID" == null) {
		result."Errors".push(new ValidationErrorInfo(
			"VectorIndexID",
			"A Vector Index ID is required when the Index Type is set to ''Vector''.",
			this."VectorIndexID",
			ValidationErrorType."Failure"
		));
	}
	// If the index is not a Vector type, ensure an External Index Name is provided
	if (this."IndexType" !== ''Vector'' && (this."ExternalIndexName" == null || this."ExternalIndexName".length === 0)) {
		result."Errors".push(new ValidationErrorInfo(
			"ExternalIndexName",
			"An External Index Name is required for the selected Index Type.",
			this."ExternalIndexName",
			ValidationErrorType."Failure"
		));
	}
}', 'To ensure search functionality works correctly, vector-based indexes must have a Vector Index ID assigned, while all other index types must have an External Index Name specified.', 'ValidateIndexTypeRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '3B80A286-D1E1-45C2-9648-C850009E1ADB');

/* Generated Validation Functions for MJ: Search Scope Permissions */
-- CHECK constraint for MJ: Search Scope Permissions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', NOW(), 'TypeScript','Approved', '([UserID] IS NOT NULL AND [RoleID] IS NULL OR [UserID] IS NULL AND [RoleID] IS NOT NULL)', 'public ValidateUserIDAndRoleIDExclusiveAssignment(result: ValidationResult) {
	// Check if both fields are null (violates the requirement that at least one must be set)
	if (this."UserID" == null && this."RoleID" == null) {
		result."Errors".push(new ValidationErrorInfo(
			"UserID",
			"Each record must be assigned to either a User or a Role.",
			this."UserID",
			ValidationErrorType."Failure"
		));
	}
	// Check if both fields are populated (violates the requirement that only one can be set)
	if (this."UserID" != null && this."RoleID" != null) {
		result."Errors".push(new ValidationErrorInfo(
			"UserID",
			"A record cannot be assigned to both a User and a Role simultaneously.",
			this."UserID",
			ValidationErrorType."Failure"
		));
	}
}', 'Each record must be assigned to either a specific user or a specific role, but not both. This ensures that permissions or scopes are clearly defined for a single entity type and prevents ambiguous assignments.', 'ValidateUserIDAndRoleIDExclusiveAssignment', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083');


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentSearchScopes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Search Scopes
-- Item: Permissions for vwAIAgentSearchScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentSearchScopes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Search Scopes
-- Item: spCreateAIAgentSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentSearchScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSearchScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Search Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSearchScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Search Scopes
-- Item: spUpdateAIAgentSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentSearchScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSearchScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSearchScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Search Scopes
-- Item: spDeleteAIAgentSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentSearchScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSearchScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Search Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSearchScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for SearchExecutionLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchExecutionLog;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchExecutionLogs" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Search Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: Permissions for vwSearchExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchExecutionLogs" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Search Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: spCreateSearchExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchExecutionLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchExecutionLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Search Execution Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchExecutionLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Search Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: spUpdateSearchExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchExecutionLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchExecutionLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchExecutionLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Search Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: spDeleteSearchExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchExecutionLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchExecutionLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Search Execution Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchExecutionLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for SearchScopeEntity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchScopeEntity;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopeExternalIndexes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Search Scope External Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope External Indexes
-- Item: Permissions for vwSearchScopeExternalIndexes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopeExternalIndexes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Search Scope External Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope External Indexes
-- Item: spCreateSearchScopeExternalIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopeExternalIndex
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopeExternalIndex" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Search Scope External Indexes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopeExternalIndex" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Search Scope External Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope External Indexes
-- Item: spUpdateSearchScopeExternalIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopeExternalIndex
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopeExternalIndex" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopeExternalIndex" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Search Scope External Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope External Indexes
-- Item: spDeleteSearchScopeExternalIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopeExternalIndex
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopeExternalIndex" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Search Scope External Indexes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopeExternalIndex" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 58E855E8-F804-4A0E-B0AC-722EC76941D8 */

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopeEntities" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Search Scope Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Entities
-- Item: Permissions for vwSearchScopeEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopeEntities" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Search Scope Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Entities
-- Item: spCreateSearchScopeEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopeEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopeEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Search Scope Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopeEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Search Scope Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Entities
-- Item: spUpdateSearchScopeEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopeEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopeEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopeEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Search Scope Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Entities
-- Item: spDeleteSearchScopeEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopeEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopeEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Search Scope Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopeEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 806A6BEF-8E3A-4957-B122-DD08B62727D2 */

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopeProviders" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Search Scope Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Providers
-- Item: Permissions for vwSearchScopeProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopeProviders" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Search Scope Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Providers
-- Item: spCreateSearchScopeProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopeProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopeProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Search Scope Providers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopeProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Search Scope Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Providers
-- Item: spUpdateSearchScopeProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopeProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopeProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopeProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Search Scope Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Providers
-- Item: spDeleteSearchScopeProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopeProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopeProvider" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Search Scope Providers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopeProvider" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: vwSearchScopePermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Scope Permissions
-----               SCHEMA:      __mj
-----               BASE TABLE:  SearchScopePermission
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopePermissions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: Permissions for vwSearchScopePermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopePermissions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: spCreateSearchScopePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopePermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopePermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Search Scope Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopePermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: spUpdateSearchScopePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopePermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopePermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopePermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: spDeleteSearchScopePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopePermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopePermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Search Scope Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopePermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for SearchScopeStorageAccount */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchScopeStorageAccount;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scopes
-- Item: Permissions for vwSearchScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scopes
-- Item: spCreateSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Search Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scopes
-- Item: spUpdateSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scopes
-- Item: spDeleteSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Search Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID BD032D1E-1B51-48BA-ACE1-AEF987C7F7AB */

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopeTestQueries" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: Permissions for vwSearchScopeTestQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopeTestQueries" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: spCreateSearchScopeTestQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopeTestQuery
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopeTestQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Search Scope Test Queries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopeTestQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: spUpdateSearchScopeTestQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopeTestQuery
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopeTestQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopeTestQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: spDeleteSearchScopeTestQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopeTestQuery
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopeTestQuery" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Search Scope Test Queries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopeTestQuery" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Search Scope Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: vwSearchScopeStorageAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Scope Storage Accounts
-----               SCHEMA:      __mj
-----               BASE TABLE:  SearchScopeStorageAccount
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopeStorageAccounts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Search Scope Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: Permissions for vwSearchScopeStorageAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwSearchScopeStorageAccounts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Search Scope Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: spCreateSearchScopeStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopeStorageAccount
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopeStorageAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Search Scope Storage Accounts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSearchScopeStorageAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Search Scope Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: spUpdateSearchScopeStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopeStorageAccount
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopeStorageAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSearchScopeStorageAccount" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Search Scope Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: spDeleteSearchScopeStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopeStorageAccount
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopeStorageAccount" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Search Scope Storage Accounts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchScopeStorageAccount" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for AIAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AIAgent;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Prompts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON TABLE __mj."SearchScope" IS 'A named, reusable boundary defining WHICH content participates in a search (providers, external indexes, entities, storage accounts). Combined with a runtime SearchContext, it enables multi-tenant, permission-aware, agent-friendly retrieval. See plans/search-scopes-rag-plus.md.';

COMMENT ON COLUMN __mj."SearchScope"."Name" IS 'Human-readable scope name (e.g., "HR Policies", "Engineering Docs"). Unique across the system.';

COMMENT ON COLUMN __mj."SearchScope"."Description" IS 'Detailed description of what this scope covers. Surfaced to agents in the available-scopes prompt injection so the LLM can choose a scope.';

COMMENT ON COLUMN __mj."SearchScope"."Icon" IS 'Font Awesome (or equivalent) icon class used by the scope selector UI.';

COMMENT ON COLUMN __mj."SearchScope"."IsGlobal" IS 'If true, this scope includes everything (equivalent to no scope filtering). Exactly one Global scope should exist; it is seeded via metadata sync.';

COMMENT ON COLUMN __mj."SearchScope"."IsDefault" IS 'If true, this is the default scope for users/agents that do not specify one.';

COMMENT ON COLUMN __mj."SearchScope"."OwnerUserID" IS 'NULL = organization-wide scope. Set = personal scope owned by this user (visible/usable only by that user unless explicitly shared).';

COMMENT ON COLUMN __mj."SearchScope"."Status" IS 'Lifecycle status. Only Active scopes are considered at query time.';

COMMENT ON COLUMN __mj."SearchScope"."StartAt" IS 'Optional time-window activation. Scope is inactive before StartAt. NULL = immediately active.';

COMMENT ON COLUMN __mj."SearchScope"."EndAt" IS 'Optional time-window deactivation. Scope is inactive after EndAt. NULL = no expiry.';

COMMENT ON COLUMN __mj."SearchScope"."ScopeConfig" IS 'JSON configuration for advanced scope behavior. Recognized keys: rrfK (RRF k parameter), fusionWeights (per-provider weights), reRanker (optional re-ranker stage config: driverClass, inputTopN, outputTopN, config), permissionOverfetchFactor.';

COMMENT ON COLUMN __mj."SearchScope"."SearchContextConfig" IS 'JSON defining available multi-tenant SearchContext dimensions, inheritance modes, and validation rules. Uses the SecondaryScopeConfig structure shared with the agent memory system (@memberjunction/ai-core-plus). NULL = scope is not multi-tenant aware.';

COMMENT ON TABLE __mj."SearchScopeProvider" IS 'Controls which SearchProviders participate in a given SearchScope. Each row enables one provider within one scope, with optional overrides.';

COMMENT ON COLUMN __mj."SearchScopeProvider"."Enabled" IS 'Whether this provider is active for this scope. Lets an admin toggle providers off per-scope without deleting the row.';

COMMENT ON COLUMN __mj."SearchScopeProvider"."MaxResultsOverride" IS 'Override the max-results value for this provider within this scope. NULL = use the provider';

COMMENT ON COLUMN __mj."SearchScopeProvider"."ProviderConfigOverride" IS 'JSON override for provider-specific configuration within this scope. Provider interprets.';

COMMENT ON COLUMN __mj."SearchScopeProvider"."QueryTransformTemplateID" IS 'Optional FK to Templates. When set, the user/agent query is rewritten through this Template before being sent to this provider. Lets vector providers get a chunk-shaped rewrite while FTS providers get keyword extraction within the same scope. Resolution order: this > AIAgentSearchScope."QueryTemplateID" > raw lastUserMessage.';

COMMENT ON TABLE __mj."SearchScopeExternalIndex" IS 'Scoped external/provider-owned indexes. Generic — covers vector stores (Pinecone, Qdrant, PGVector) and text/hybrid engines (Elasticsearch, Typesense, Azure AI Search, OpenSearch). A single scope can mix types; each row is consumed only by the provider matching its IndexType.';

COMMENT ON COLUMN __mj."SearchScopeExternalIndex"."IndexType" IS 'Discriminator. Determines which provider class consumes this row: Vector | Elasticsearch | Typesense | AzureAISearch | OpenSearch | Other.';

COMMENT ON COLUMN __mj."SearchScopeExternalIndex"."VectorIndexID" IS 'FK to VectorIndex. REQUIRED when IndexType=';

COMMENT ON COLUMN __mj."SearchScopeExternalIndex"."ExternalIndexName" IS 'For non-vector IndexTypes: the remote engine';

COMMENT ON COLUMN __mj."SearchScopeExternalIndex"."ExternalIndexConfig" IS 'JSON with extra connection/config hints the provider needs (cluster alias, routing key, custom analyzer, etc.). Provider-interpreted.';

COMMENT ON COLUMN __mj."SearchScopeExternalIndex"."MetadataFilter" IS 'JSON filter expression applied as a native metadata filter on the remote engine. Pinecone/Qdrant/PGVector metadata filter, or Elasticsearch filter DSL, etc. Rendered as a Nunjucks template so SearchContext."PrimaryScopeRecordID" and SearchContext."SecondaryScopes".* can be interpolated for multi-tenant filtering.';

COMMENT ON TABLE __mj."SearchScopeEntity" IS 'Controls which entities participate in entity and full-text search within a scope, with optional per-entity filter and user-search-string overrides.';

COMMENT ON COLUMN __mj."SearchScopeEntity"."ExtraFilter" IS 'Optional SQL filter applied to this entity';

COMMENT ON COLUMN __mj."SearchScopeEntity"."UserSearchString" IS 'Optional override for the UserSearchString passed to RunView for this entity within this scope. Nunjucks template (e.g., "{{ query }} AND type:policy"). NULL = pass the user';

COMMENT ON TABLE __mj."SearchScopeStorageAccount" IS 'Controls which file storage accounts/folders participate in a scope.';

COMMENT ON COLUMN __mj."SearchScopeStorageAccount"."FolderPath" IS 'Optional folder path restriction. NULL = entire storage account. Example: /policies/hr/. Rendered as a Nunjucks template with SearchContext variables so platforms can do per-tenant folder routing like /tenants/{{ context."PrimaryScopeRecordID" }}/.';

COMMENT ON TABLE __mj."AIAgentSearchScope" IS 'Many-to-many between agents and search scopes, with phase and scheduling control. Drives both pre-execution RAG and agent-invoked scoped search.';

COMMENT ON COLUMN __mj."AIAgentSearchScope"."Phase" IS 'When this scope is used: PreExecution (injected as retrieved context before the agent runs), AgentInvoked (callable via the scoped search Action), or Both.';

COMMENT ON COLUMN __mj."AIAgentSearchScope"."Status" IS 'Lifecycle status. Only Active rows are considered at runtime.';

COMMENT ON COLUMN __mj."AIAgentSearchScope"."StartAt" IS 'Time-windowed activation for this agent-scope assignment. NULL = immediately active.';

COMMENT ON COLUMN __mj."AIAgentSearchScope"."EndAt" IS 'Time-windowed deactivation for this agent-scope assignment. NULL = no expiry.';

COMMENT ON COLUMN __mj."AIAgentSearchScope"."Priority" IS 'Ordering within Phase. Lower = higher priority. Used for pre-execution ordering and as default preference for agent-invoked scope selection.';

COMMENT ON COLUMN __mj."AIAgentSearchScope"."MaxResults" IS 'Override max results for this scope when used by this agent. NULL = use scope/engine default.';

COMMENT ON COLUMN __mj."AIAgentSearchScope"."MinScore" IS 'Override min score threshold (0.0000–1.0000). NULL = use engine default.';

COMMENT ON COLUMN __mj."AIAgentSearchScope"."QueryTemplateID" IS 'FK to Templates. MJ Template used to generate the search query from conversation context (lastUserMessage, recentMessages, payload, etc.). NULL = use lastUserMessage as-is. Can be further specialized per-provider via SearchScopeProvider."QueryTransformTemplateID".';

COMMENT ON COLUMN __mj."AIAgentSearchScope"."FusionWeightsOverride" IS 'JSON override for RRF per-provider fusion weights when this agent uses this scope. Resolution order: AIAgentSearchScope."FusionWeightsOverride" > SearchScope."ScopeConfig".fusionWeights > engine defaults. Example: { "vector": 2.0, "fulltext": 1.0, "entity": 1.0 }.';

COMMENT ON COLUMN __mj."AIAgentSearchScope"."IsDefault" IS 'If true, this is the agent';

COMMENT ON COLUMN __mj."AIAgent"."SearchScopeAccess" IS 'Controls the agent';

COMMENT ON TABLE __mj."SearchScopePermission" IS 'Per-user or per-role permission grant on a SearchScope. Exactly one of UserID or RoleID is set on each row; the other is NULL. PermissionLevel is one of None, Read, Search, Manage. Combined with AIAgent."SearchScopeAccess" for agent-side fallbacks via the SearchScopePermissionResolver.';

COMMENT ON COLUMN __mj."SearchScopePermission"."ID" IS 'Primary key. Auto-generated.';

COMMENT ON COLUMN __mj."SearchScopePermission"."SearchScopeID" IS 'The SearchScope this permission row applies to.';

COMMENT ON COLUMN __mj."SearchScopePermission"."UserID" IS 'The user this permission applies to. Mutually exclusive with RoleID — exactly one must be set.';

COMMENT ON COLUMN __mj."SearchScopePermission"."RoleID" IS 'The role this permission applies to. Mutually exclusive with UserID — exactly one must be set. Permissions granted via roles flow to all users in that role.';

COMMENT ON COLUMN __mj."SearchScopePermission"."PermissionLevel" IS 'Capability granted on this SearchScope. None = explicit deny (overrides role grants), Read = view scope metadata, Search = invoke ScopedSearchAction, Manage = full edit including authoring of permission rows. The resolver picks the highest level when multiple grants apply (direct + role).';

COMMENT ON COLUMN __mj."SearchScope"."RerankerBudgetCents" IS 'Optional cap on reranker spend (in cents) per search invocation against this scope. NULL means uncapped — existing behavior. When set, the SearchEngine';

COMMENT ON TABLE __mj."SearchExecutionLog" IS 'One row per SearchEngine.search invocation. Populated by SearchEngine';

COMMENT ON COLUMN __mj."SearchExecutionLog"."SearchScopeID" IS 'The SearchScope this invocation targeted. NULL for unscoped global search.';

COMMENT ON COLUMN __mj."SearchExecutionLog"."UserID" IS 'The User who initiated the search. NULL for system / unauthenticated callers.';

COMMENT ON COLUMN __mj."SearchExecutionLog"."AIAgentID" IS 'The AIAgent identity if the search was invoked from an agent (e.g. ScopedSearchAction). NULL for direct human-initiated searches.';

COMMENT ON COLUMN __mj."SearchExecutionLog"."Query" IS 'Raw query string the user / agent submitted. TEXT because some queries are long (full sentences, snippets). Stored verbatim for analytics — do NOT rely on this for permission decisions.';

COMMENT ON COLUMN __mj."SearchExecutionLog"."TotalDurationMs" IS 'End-to-end search duration in milliseconds, measured at the SearchEngine.search call boundary (provider runs + fusion + rerank + permission filter + enrichment).';

COMMENT ON COLUMN __mj."SearchExecutionLog"."ResultCount" IS 'Number of results returned to the caller after permission filtering, deduplication, and score-threshold trimming. Use this as the hit-rate denominator (rows where ResultCount > 0).';

COMMENT ON COLUMN __mj."SearchExecutionLog"."RerankerName" IS 'BaseReRanker."Name" of the reranker that ran (e.g. ';

COMMENT ON COLUMN __mj."SearchExecutionLog"."RerankerCostCents" IS 'Total reranker spend in cents for this invocation, populated from the BaseReRanker."CostReporter" callback via RerankerBudgetGuard. NULL when no rerank ran or no real-provider cost was incurred (Noop / BGE).';

COMMENT ON COLUMN __mj."SearchExecutionLog"."Status" IS 'Outcome of the search: ';

COMMENT ON COLUMN __mj."SearchExecutionLog"."FailureReason" IS 'Short human-readable failure reason when Status = ';

COMMENT ON COLUMN __mj."SearchExecutionLog"."ProvidersJSON" IS 'JSON array of per-provider breakdown entries: [{"Provider":"Vector","DurationMs":123,"ResultCount":5,"ErrorMessage":null}, ...]. Used by the analytics dashboard for p50/p95 latency-by-provider charts and to spot consistently slow providers.';

COMMENT ON TABLE __mj."SearchScopeTestQuery" IS 'Canonical test queries owned by a SearchScope. Used by scope authors to validate tuning changes — re-run a saved query after swapping the reranker or adjusting fusion weights and compare results to the prior run.';

COMMENT ON COLUMN __mj."SearchScopeTestQuery"."SearchScopeID" IS 'The SearchScope this test query belongs to. Cascade-restricted via FK so accidental scope deletion preserves test history.';

COMMENT ON COLUMN __mj."SearchScopeTestQuery"."Label" IS 'Short human-readable label for the test query, shown in the form';

COMMENT ON COLUMN __mj."SearchScopeTestQuery"."Query" IS 'The query text itself. TEXT because canonical queries can be full sentences or chunks of natural-language context.';

COMMENT ON COLUMN __mj."SearchScopeTestQuery"."ExpectedTopResultEntity" IS 'Optional MJ entity name (e.g. "Contacts", "Documents") of the expected top result. When set together with ExpectedTopResultRecordID, lets the test runner assert that the tuned scope returns the right record at rank #1 — a regression tripwire for fusion / reranker changes.';

COMMENT ON COLUMN __mj."SearchScopeTestQuery"."ExpectedTopResultRecordID" IS 'Optional record ID of the expected top result, paired with ExpectedTopResultEntity. NULL = no assertion (the query is exploratory).';

COMMENT ON COLUMN __mj."SearchScopeTestQuery"."Notes" IS 'Free-form notes explaining why this query is canonical or what edge case it represents.';


-- ===================== Other =====================

-- =============================================================================
-- EXTENDED PROPERTIES (all new columns except PKs/FKs)
-- =============================================================================

-- ---- SearchScope ----

-- =============================================================================
-- Extended Properties
-- =============================================================================

-- =====================================================================================================================
-- Section 6: Post-hoc — SearchScopePermission unique constraints
-- (Source: V202604291522__v5.30.x__Fix_SearchScopePermission_UniqueConstraints.sql)
-- =====================================================================================================================

-- =============================================================================
-- Migration: Fix SearchScopePermission unique constraints (filtered indexes)
-- Version:   v5.30.x
-- Plan:      RAG_plan.md §3 Phase 2A.2 (correction to V202604280730)
-- =============================================================================
-- The original migration (V202604280730__v5.30.x__Add_SearchScopePermission.sql)
-- created two unique CONSTRAINTS:
--
--   UQ_SearchScopePermission_User UNIQUE (SearchScopeID, UserID)
--   UQ_SearchScopePermission_Role UNIQUE (SearchScopeID, RoleID)
--
-- Intent: prevent duplicate user grants and duplicate role grants per scope.
--
-- Bug: SQL Server's UNIQUE CONSTRAINT semantics treat NULL as a value for
-- equality, so once a row exists with `RoleID = NULL` (every user grant), no
-- second user grant can be added on the same scope (both have RoleID=NULL,
-- collision). The same problem applies symmetrically to UserID=NULL on role
-- grants. Re-walking SEARCH_USAGE.md §5.1 surfaced this — adding a second
-- user grant after the auto-Manage grant fails with
-- "Violation of UNIQUE KEY constraint UQ_SearchScopePermission_Role".
--
-- Fix: drop the constraints and replace each with a FILTERED unique index that
-- only enforces uniqueness when the relevant ID is non-NULL. This preserves
-- the no-duplicates intent while allowing arbitrarily many user grants
-- (RoleID=NULL) and arbitrarily many role grants (UserID=NULL) per scope.
--
-- Note: filtered unique indexes are functionally equivalent to UNIQUE
-- CONSTRAINTs but are more permissive on NULLs. CodeGen treats them the same
-- way for entity metadata.
-- =============================================================================

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: AI Agent Search Scopes */

/* spUpdate Permissions for MJ: Search Execution Logs */

/* spUpdate Permissions for MJ: Search Scope External Indexes */

/* spUpdate Permissions for MJ: Search Scope Entities */

/* spUpdate Permissions for MJ: Search Scope Providers */

/* spUpdate Permissions for MJ: Search Scope Permissions */

/* spUpdate Permissions for MJ: Search Scopes */

/* spUpdate Permissions for MJ: Search Scope Test Queries */

/* spUpdate Permissions for MJ: Search Scope Storage Accounts */

/* spUpdate Permissions for MJ: AI Agents */
