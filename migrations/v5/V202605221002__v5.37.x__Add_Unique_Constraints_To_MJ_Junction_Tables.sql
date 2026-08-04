-- ============================================================================
-- Add UNIQUE constraints to junction-style metadata tables in __mj.
--
-- Background
-- ----------
-- The __mj.Entity table protects its natural key via UQ_Entity_Name (UNIQUE on
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

PRINT N'--- Adding UNIQUE constraints to 17 __mj junction tables ---';
PRINT N'    Policy: keep earliest by __mj_CreatedAt; delete duplicates; then add constraint.';
PRINT N'';

DECLARE @dupCount INT;
DECLARE @deleted INT;

-- ----------------------------------------------------------------------------
-- ActionAuthorization (ActionID, AuthorizationID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT ActionID, AuthorizationID FROM ${flyway:defaultSchema}.ActionAuthorization
    GROUP BY ActionID, AuthorizationID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.ActionAuthorization: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (ActionID, AuthorizationID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY ActionID, AuthorizationID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.ActionAuthorization
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.ActionAuthorization
    ADD CONSTRAINT UQ_ActionAuthorization_ActionID_AuthorizationID
    UNIQUE (ActionID, AuthorizationID);

-- ----------------------------------------------------------------------------
-- ActionContext (ActionID, ContextTypeID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT ActionID, ContextTypeID FROM ${flyway:defaultSchema}.ActionContext
    GROUP BY ActionID, ContextTypeID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.ActionContext: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (ActionID, ContextTypeID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY ActionID, ContextTypeID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.ActionContext
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.ActionContext
    ADD CONSTRAINT UQ_ActionContext_ActionID_ContextTypeID
    UNIQUE (ActionID, ContextTypeID);

-- ----------------------------------------------------------------------------
-- ActionLibrary (ActionID, LibraryID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT ActionID, LibraryID FROM ${flyway:defaultSchema}.ActionLibrary
    GROUP BY ActionID, LibraryID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.ActionLibrary: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (ActionID, LibraryID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY ActionID, LibraryID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.ActionLibrary
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.ActionLibrary
    ADD CONSTRAINT UQ_ActionLibrary_ActionID_LibraryID
    UNIQUE (ActionID, LibraryID);

-- ----------------------------------------------------------------------------
-- AIAgentArtifactType (AgentID, ArtifactTypeID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT AgentID, ArtifactTypeID FROM ${flyway:defaultSchema}.AIAgentArtifactType
    GROUP BY AgentID, ArtifactTypeID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.AIAgentArtifactType: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (AgentID, ArtifactTypeID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY AgentID, ArtifactTypeID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.AIAgentArtifactType
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.AIAgentArtifactType
    ADD CONSTRAINT UQ_AIAgentArtifactType_AgentID_ArtifactTypeID
    UNIQUE (AgentID, ArtifactTypeID);

-- ----------------------------------------------------------------------------
-- AIModelAction (AIActionID, AIModelID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT AIActionID, AIModelID FROM ${flyway:defaultSchema}.AIModelAction
    GROUP BY AIActionID, AIModelID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.AIModelAction: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (AIActionID, AIModelID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY AIActionID, AIModelID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.AIModelAction
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.AIModelAction
    ADD CONSTRAINT UQ_AIModelAction_AIActionID_AIModelID
    UNIQUE (AIActionID, AIModelID);

-- ----------------------------------------------------------------------------
-- APIKeyApplication (APIKeyID, ApplicationID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT APIKeyID, ApplicationID FROM ${flyway:defaultSchema}.APIKeyApplication
    GROUP BY APIKeyID, ApplicationID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.APIKeyApplication: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (APIKeyID, ApplicationID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY APIKeyID, ApplicationID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.APIKeyApplication
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.APIKeyApplication
    ADD CONSTRAINT UQ_APIKeyApplication_APIKeyID_ApplicationID
    UNIQUE (APIKeyID, ApplicationID);

-- ----------------------------------------------------------------------------
-- ApplicationEntity (ApplicationID, EntityID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT ApplicationID, EntityID FROM ${flyway:defaultSchema}.ApplicationEntity
    GROUP BY ApplicationID, EntityID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.ApplicationEntity: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (ApplicationID, EntityID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY ApplicationID, EntityID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.ApplicationEntity
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.ApplicationEntity
    ADD CONSTRAINT UQ_ApplicationEntity_ApplicationID_EntityID
    UNIQUE (ApplicationID, EntityID);

-- ----------------------------------------------------------------------------
-- AuthorizationRole (AuthorizationID, RoleID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT AuthorizationID, RoleID FROM ${flyway:defaultSchema}.AuthorizationRole
    GROUP BY AuthorizationID, RoleID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.AuthorizationRole: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (AuthorizationID, RoleID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY AuthorizationID, RoleID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.AuthorizationRole
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.AuthorizationRole
    ADD CONSTRAINT UQ_AuthorizationRole_AuthorizationID_RoleID
    UNIQUE (AuthorizationID, RoleID);

-- ----------------------------------------------------------------------------
-- ComponentDependency (ComponentID, DependencyComponentID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT ComponentID, DependencyComponentID FROM ${flyway:defaultSchema}.ComponentDependency
    GROUP BY ComponentID, DependencyComponentID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.ComponentDependency: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (ComponentID, DependencyComponentID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY ComponentID, DependencyComponentID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.ComponentDependency
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.ComponentDependency
    ADD CONSTRAINT UQ_ComponentDependency_ComponentID_DependencyComponentID
    UNIQUE (ComponentID, DependencyComponentID);

-- ----------------------------------------------------------------------------
-- ComponentLibraryLink (ComponentID, LibraryID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT ComponentID, LibraryID FROM ${flyway:defaultSchema}.ComponentLibraryLink
    GROUP BY ComponentID, LibraryID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.ComponentLibraryLink: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (ComponentID, LibraryID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY ComponentID, LibraryID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.ComponentLibraryLink
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.ComponentLibraryLink
    ADD CONSTRAINT UQ_ComponentLibraryLink_ComponentID_LibraryID
    UNIQUE (ComponentID, LibraryID);

-- ----------------------------------------------------------------------------
-- EmployeeRole (EmployeeID, RoleID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT EmployeeID, RoleID FROM ${flyway:defaultSchema}.EmployeeRole
    GROUP BY EmployeeID, RoleID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.EmployeeRole: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (EmployeeID, RoleID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY EmployeeID, RoleID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.EmployeeRole
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.EmployeeRole
    ADD CONSTRAINT UQ_EmployeeRole_EmployeeID_RoleID
    UNIQUE (EmployeeID, RoleID);

-- ----------------------------------------------------------------------------
-- EmployeeSkill (EmployeeID, SkillID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT EmployeeID, SkillID FROM ${flyway:defaultSchema}.EmployeeSkill
    GROUP BY EmployeeID, SkillID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.EmployeeSkill: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (EmployeeID, SkillID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY EmployeeID, SkillID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.EmployeeSkill
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.EmployeeSkill
    ADD CONSTRAINT UQ_EmployeeSkill_EmployeeID_SkillID
    UNIQUE (EmployeeID, SkillID);

-- ----------------------------------------------------------------------------
-- EntityAction (ActionID, EntityID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT ActionID, EntityID FROM ${flyway:defaultSchema}.EntityAction
    GROUP BY ActionID, EntityID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.EntityAction: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (ActionID, EntityID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY ActionID, EntityID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.EntityAction
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.EntityAction
    ADD CONSTRAINT UQ_EntityAction_ActionID_EntityID
    UNIQUE (ActionID, EntityID);

-- ----------------------------------------------------------------------------
-- EntityCommunicationMessageType (BaseMessageTypeID, EntityID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT BaseMessageTypeID, EntityID FROM ${flyway:defaultSchema}.EntityCommunicationMessageType
    GROUP BY BaseMessageTypeID, EntityID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.EntityCommunicationMessageType: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (BaseMessageTypeID, EntityID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY BaseMessageTypeID, EntityID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.EntityCommunicationMessageType
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.EntityCommunicationMessageType
    ADD CONSTRAINT UQ_EntityCommunicationMessageType_BaseMessageTypeID_EntityID
    UNIQUE (BaseMessageTypeID, EntityID);

-- ----------------------------------------------------------------------------
-- FileEntityRecordLink (EntityID, FileID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT EntityID, FileID FROM ${flyway:defaultSchema}.FileEntityRecordLink
    GROUP BY EntityID, FileID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.FileEntityRecordLink: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (EntityID, FileID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY EntityID, FileID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.FileEntityRecordLink
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.FileEntityRecordLink
    ADD CONSTRAINT UQ_FileEntityRecordLink_EntityID_FileID
    UNIQUE (EntityID, FileID);

-- ----------------------------------------------------------------------------
-- QueryPermission (QueryID, RoleID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT QueryID, RoleID FROM ${flyway:defaultSchema}.QueryPermission
    GROUP BY QueryID, RoleID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.QueryPermission: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (QueryID, RoleID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY QueryID, RoleID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.QueryPermission
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.QueryPermission
    ADD CONSTRAINT UQ_QueryPermission_QueryID_RoleID
    UNIQUE (QueryID, RoleID);

-- ----------------------------------------------------------------------------
-- UserApplicationEntity (UserApplicationID, EntityID)
-- ----------------------------------------------------------------------------
SELECT @dupCount = COUNT(*) FROM (
    SELECT UserApplicationID, EntityID FROM ${flyway:defaultSchema}.UserApplicationEntity
    GROUP BY UserApplicationID, EntityID HAVING COUNT(*) > 1
) AS d;

IF @dupCount > 0
BEGIN
    PRINT N'__mj.UserApplicationEntity: ' + CAST(@dupCount AS NVARCHAR(20)) + N' duplicate (UserApplicationID, EntityID) pairs detected';

    WITH ranked AS (
        SELECT ID, ROW_NUMBER() OVER (PARTITION BY UserApplicationID, EntityID ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
        FROM ${flyway:defaultSchema}.UserApplicationEntity
    )
    DELETE FROM ranked WHERE rn > 1;

    SET @deleted = @@ROWCOUNT;
    PRINT N'    Deleted ' + CAST(@deleted AS NVARCHAR(20)) + N' duplicate rows';
END

ALTER TABLE ${flyway:defaultSchema}.UserApplicationEntity
    ADD CONSTRAINT UQ_UserApplicationEntity_UserApplicationID_EntityID
    UNIQUE (UserApplicationID, EntityID);

PRINT N'';
PRINT N'--- All 17 UNIQUE constraints applied ---';
