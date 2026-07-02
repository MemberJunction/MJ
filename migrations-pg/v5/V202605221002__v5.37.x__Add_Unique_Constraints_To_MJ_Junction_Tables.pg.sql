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


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "ActionID", "AuthorizationID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."ActionAuthorization"
)
DELETE FROM __mj."ActionAuthorization" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "ActionID", "ContextTypeID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."ActionContext"
)
DELETE FROM __mj."ActionContext" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "ActionID", "LibraryID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."ActionLibrary"
)
DELETE FROM __mj."ActionLibrary" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "AgentID", "ArtifactTypeID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."AIAgentArtifactType"
)
DELETE FROM __mj."AIAgentArtifactType" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "AIActionID", "AIModelID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."AIModelAction"
)
DELETE FROM __mj."AIModelAction" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "APIKeyID", "ApplicationID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."APIKeyApplication"
)
DELETE FROM __mj."APIKeyApplication" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "ApplicationID", "EntityID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."ApplicationEntity"
)
DELETE FROM __mj."ApplicationEntity" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "AuthorizationID", "RoleID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."AuthorizationRole"
)
DELETE FROM __mj."AuthorizationRole" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "ComponentID", "DependencyComponentID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."ComponentDependency"
)
DELETE FROM __mj."ComponentDependency" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "ComponentID", "LibraryID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."ComponentLibraryLink"
)
DELETE FROM __mj."ComponentLibraryLink" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "EmployeeID", "RoleID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."EmployeeRole"
)
DELETE FROM __mj."EmployeeRole" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "EmployeeID", "SkillID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."EmployeeSkill"
)
DELETE FROM __mj."EmployeeSkill" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "ActionID", "EntityID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."EntityAction"
)
DELETE FROM __mj."EntityAction" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "BaseMessageTypeID", "EntityID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."EntityCommunicationMessageType"
)
DELETE FROM __mj."EntityCommunicationMessageType" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "EntityID", "FileID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."FileEntityRecordLink"
)
DELETE FROM __mj."FileEntityRecordLink" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "QueryID", "RoleID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."QueryPermission"
)
DELETE FROM __mj."QueryPermission" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;

WITH ranked AS (
    SELECT "ID", ROW_NUMBER() OVER (PARTITION BY "UserApplicationID", "EntityID" ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
        FROM __mj."UserApplicationEntity"
)
DELETE FROM __mj."UserApplicationEntity" t USING ranked
WHERE t."ID" = ranked."ID" AND ranked.rn > 1;


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."ActionAuthorization"
 ADD CONSTRAINT "UQ_ActionAuthorization_ActionID_AuthorizationID"
    UNIQUE ("ActionID", "AuthorizationID");

ALTER TABLE __mj."ActionContext"
 ADD CONSTRAINT "UQ_ActionContext_ActionID_ContextTypeID"
    UNIQUE ("ActionID", "ContextTypeID");

ALTER TABLE __mj."ActionLibrary"
 ADD CONSTRAINT "UQ_ActionLibrary_ActionID_LibraryID"
    UNIQUE ("ActionID", "LibraryID");

ALTER TABLE __mj."AIAgentArtifactType"
 ADD CONSTRAINT "UQ_AIAgentArtifactType_AgentID_ArtifactTypeID"
    UNIQUE ("AgentID", "ArtifactTypeID");

ALTER TABLE __mj."AIModelAction"
 ADD CONSTRAINT "UQ_AIModelAction_AIActionID_AIModelID"
    UNIQUE ("AIActionID", "AIModelID");

ALTER TABLE __mj."APIKeyApplication"
 ADD CONSTRAINT "UQ_APIKeyApplication_APIKeyID_ApplicationID"
    UNIQUE ("APIKeyID", "ApplicationID");

ALTER TABLE __mj."ApplicationEntity"
 ADD CONSTRAINT "UQ_ApplicationEntity_ApplicationID_EntityID"
    UNIQUE ("ApplicationID", "EntityID");

ALTER TABLE __mj."AuthorizationRole"
 ADD CONSTRAINT "UQ_AuthorizationRole_AuthorizationID_RoleID"
    UNIQUE ("AuthorizationID", "RoleID");

ALTER TABLE __mj."ComponentDependency"
 ADD CONSTRAINT "UQ_ComponentDependency_ComponentID_DependencyComponentID"
    UNIQUE ("ComponentID", "DependencyComponentID");

ALTER TABLE __mj."ComponentLibraryLink"
 ADD CONSTRAINT "UQ_ComponentLibraryLink_ComponentID_LibraryID"
    UNIQUE ("ComponentID", "LibraryID");

ALTER TABLE __mj."EmployeeRole"
 ADD CONSTRAINT "UQ_EmployeeRole_EmployeeID_RoleID"
    UNIQUE ("EmployeeID", "RoleID");

ALTER TABLE __mj."EmployeeSkill"
 ADD CONSTRAINT "UQ_EmployeeSkill_EmployeeID_SkillID"
    UNIQUE ("EmployeeID", "SkillID");

ALTER TABLE __mj."EntityAction"
 ADD CONSTRAINT "UQ_EntityAction_ActionID_EntityID"
    UNIQUE ("ActionID", "EntityID");

ALTER TABLE __mj."EntityCommunicationMessageType"
 ADD CONSTRAINT "UQ_EntityCommunicationMessageType_BaseMessageTypeID_EntityID"
    UNIQUE ("BaseMessageTypeID", "EntityID");

ALTER TABLE __mj."FileEntityRecordLink"
 ADD CONSTRAINT "UQ_FileEntityRecordLink_EntityID_FileID"
    UNIQUE ("EntityID", "FileID");

ALTER TABLE __mj."QueryPermission"
 ADD CONSTRAINT "UQ_QueryPermission_QueryID_RoleID"
    UNIQUE ("QueryID", "RoleID");

ALTER TABLE __mj."UserApplicationEntity"
 ADD CONSTRAINT "UQ_UserApplicationEntity_UserApplicationID_EntityID"
    UNIQUE ("UserApplicationID", "EntityID");


-- ===================== Other =====================

-- ============================================================================
-- Add UNIQUE constraints to junction-style metadata tables in __mj.
--
-- Background
-- ----------
-- The __mj."Entity" table protects its natural key via UQ_Entity_Name (UNIQUE on
-- Name), so two entities with the same Name cannot be inserted even if the
-- application code's gating fails. The closely-related junction tables that
-- associate an entity (or other primary record) with another record had no
-- equivalent enforcement at the schema level. Their "natural keys" — typically
-- a pair of foreign-key columns — are expected to be unique in practice (an
-- entity belongs to an application once, an action belongs to a library once,
-- etc.) but were not enforced.
--
-- This asymmetry has bitten production before: when entities get
-- delete-and-recreated during early bootstrap, when multiple bootstrap scripts
-- run in succession, or when CodeGen's input-gating fails for any reason, these
-- tables can silently accumulate semantic duplicates that the application UI
-- then treats as collisions.
--
-- Scope
-- -----
-- The 17 tables below are all "pure junction" tables in __mj — they consist of
-- two foreign-key columns plus ID/Sequence/timestamps, with no other meaningful
-- data columns, and they're populated either exclusively by CodeGen / metadata
-- sync (no runtime UI/API writers) or by first-creation-only paths that should
-- never produce duplicates if working correctly. Adding the constraint here
-- protects against bugs in those writers — if a writer ever tries to produce a
-- duplicate, the failure surfaces immediately instead of silently corrupting
-- metadata.
--
-- Dedupe policy
-- -------------
-- This migration auto-removes pre-existing duplicate (FK1, FK2) pairs before
-- adding each constraint. Within a duplicate group, the row with the EARLIEST
-- __mj_CreatedAt (with ID as tiebreaker for determinism) is retained; all
-- other rows in the group are deleted. Per-table duplicate counts and deletion
-- counts are printed to the migration log so the audit trail is preserved.
--
-- Operators upgrading databases that may have pre-existing junction duplicates
-- should review the migration log output to confirm what was removed. The
-- alternative — failing the migration on first duplicate — was rejected
-- because mid-migration failures leave the schema half-applied and require
-- manual recovery.
-- ============================================================================
