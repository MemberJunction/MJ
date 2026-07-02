-- ============================================================================
-- Test assertion: verify the UNIQUE-constraint migration deduped correctly,
-- created the expected constraints, and now rejects duplicate inserts.
--
-- Runs after 01_seed_duplicates.sql + the v5.37.x migration.
--
-- Hardcoded UUIDs must match 01_seed_duplicates.sql exactly.
-- Any THROW exits the script with a clear failure message.
-- ============================================================================

SET XACT_ABORT ON;
SET NOCOUNT ON;

DECLARE @AE_Survivor UNIQUEIDENTIFIER = 'AE000000-0000-0000-0000-000000000001';
DECLARE @AE_Dup1     UNIQUEIDENTIFIER = 'AE000000-0000-0000-0000-000000000002';
DECLARE @AE_Dup2     UNIQUEIDENTIFIER = 'AE000000-0000-0000-0000-000000000003';

DECLARE @AL_Survivor UNIQUEIDENTIFIER = 'A1000000-0000-0000-0000-000000000001';
DECLARE @AL_Dup1     UNIQUEIDENTIFIER = 'A1000000-0000-0000-0000-000000000002';

-- ----------------------------------------------------------------------------
-- Assertion 1: ApplicationEntity dedupe — survivor present, dups deleted
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM __mj.ApplicationEntity WHERE ID = @AE_Survivor)
    THROW 50001, 'FAIL: AE survivor row was deleted (should have been retained as earliest)', 1;

IF EXISTS (SELECT 1 FROM __mj.ApplicationEntity WHERE ID = @AE_Dup1)
    THROW 50002, 'FAIL: AE duplicate 1 was NOT deleted', 1;

IF EXISTS (SELECT 1 FROM __mj.ApplicationEntity WHERE ID = @AE_Dup2)
    THROW 50003, 'FAIL: AE duplicate 2 was NOT deleted', 1;

PRINT 'PASS: ApplicationEntity dedupe — survivor retained, 2 duplicates removed';

-- ----------------------------------------------------------------------------
-- Assertion 2: ActionLibrary dedupe (only if it was seeded)
-- ----------------------------------------------------------------------------
DECLARE @AL_WasSeeded BIT = CASE
    WHEN EXISTS (SELECT 1 FROM __mj.ActionLibrary WHERE ID IN (@AL_Survivor, @AL_Dup1))
    THEN 1 ELSE 0 END;

IF @AL_WasSeeded = 0
    PRINT 'SKIP: ActionLibrary — was not seeded (prerequisite tables likely empty)';
ELSE
BEGIN
    IF NOT EXISTS (SELECT 1 FROM __mj.ActionLibrary WHERE ID = @AL_Survivor)
        THROW 50004, 'FAIL: AL survivor row was deleted (should have been retained as earliest)', 1;

    IF EXISTS (SELECT 1 FROM __mj.ActionLibrary WHERE ID = @AL_Dup1)
        THROW 50005, 'FAIL: AL duplicate was NOT deleted', 1;

    PRINT 'PASS: ActionLibrary dedupe — survivor retained, 1 duplicate removed';
END

-- ----------------------------------------------------------------------------
-- Assertion 3: All 17 UNIQUE constraints exist
-- ----------------------------------------------------------------------------
DECLARE @ExpectedConstraints TABLE (TableName SYSNAME, ConstraintName SYSNAME);
INSERT INTO @ExpectedConstraints VALUES
    ('ActionAuthorization',          'UQ_ActionAuthorization_ActionID_AuthorizationID'),
    ('ActionContext',                'UQ_ActionContext_ActionID_ContextTypeID'),
    ('ActionLibrary',                'UQ_ActionLibrary_ActionID_LibraryID'),
    ('AIAgentArtifactType',          'UQ_AIAgentArtifactType_AgentID_ArtifactTypeID'),
    ('AIModelAction',                'UQ_AIModelAction_AIActionID_AIModelID'),
    ('APIKeyApplication',            'UQ_APIKeyApplication_APIKeyID_ApplicationID'),
    ('ApplicationEntity',            'UQ_ApplicationEntity_ApplicationID_EntityID'),
    ('AuthorizationRole',            'UQ_AuthorizationRole_AuthorizationID_RoleID'),
    ('ComponentDependency',          'UQ_ComponentDependency_ComponentID_DependencyComponentID'),
    ('ComponentLibraryLink',         'UQ_ComponentLibraryLink_ComponentID_LibraryID'),
    ('EmployeeRole',                 'UQ_EmployeeRole_EmployeeID_RoleID'),
    ('EmployeeSkill',                'UQ_EmployeeSkill_EmployeeID_SkillID'),
    ('EntityAction',                 'UQ_EntityAction_ActionID_EntityID'),
    ('EntityCommunicationMessageType','UQ_EntityCommunicationMessageType_BaseMessageTypeID_EntityID'),
    ('FileEntityRecordLink',         'UQ_FileEntityRecordLink_EntityID_FileID'),
    ('QueryPermission',              'UQ_QueryPermission_QueryID_RoleID'),
    ('UserApplicationEntity',        'UQ_UserApplicationEntity_UserApplicationID_EntityID');

DECLARE @MissingCount INT = (
    SELECT COUNT(*) FROM @ExpectedConstraints ec
    WHERE NOT EXISTS (
        SELECT 1 FROM sys.indexes i
        JOIN sys.objects o ON o.object_id = i.object_id
        WHERE o.name = ec.TableName
          AND i.name = ec.ConstraintName
          AND i.is_unique = 1
    )
);

IF @MissingCount > 0
BEGIN
    SELECT 'MISSING' AS Status, ec.TableName, ec.ConstraintName
    FROM @ExpectedConstraints ec
    WHERE NOT EXISTS (
        SELECT 1 FROM sys.indexes i
        JOIN sys.objects o ON o.object_id = i.object_id
        WHERE o.name = ec.TableName AND i.name = ec.ConstraintName AND i.is_unique = 1
    );
    THROW 50006, 'FAIL: One or more expected UNIQUE constraints are missing (see SELECT output above)', 1;
END

PRINT 'PASS: All 17 UNIQUE constraints exist';

-- ----------------------------------------------------------------------------
-- Assertion 4: Constraint actually rejects duplicate inserts (error 2627)
-- ----------------------------------------------------------------------------
DECLARE @SurvivorAppID UNIQUEIDENTIFIER, @SurvivorEntID UNIQUEIDENTIFIER;
SELECT @SurvivorAppID = ApplicationID, @SurvivorEntID = EntityID
FROM __mj.ApplicationEntity WHERE ID = @AE_Survivor;

DECLARE @ViolationCaught BIT = 0;
BEGIN TRY
    INSERT INTO __mj.ApplicationEntity (ID, ApplicationID, EntityID, Sequence)
        VALUES (NEWID(), @SurvivorAppID, @SurvivorEntID, 999);
    -- If we got here, the constraint DIDN'T fire — that's a failure
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627)  -- 2627=UNIQUE constraint, 2601=duplicate key
        SET @ViolationCaught = 1;
    ELSE
        THROW;  -- some other error — surface it
END CATCH

IF @ViolationCaught = 0
    THROW 50007, 'FAIL: Duplicate INSERT into ApplicationEntity was NOT rejected by the constraint', 1;

PRINT 'PASS: Duplicate INSERT correctly rejected (error 2627/2601)';

-- ----------------------------------------------------------------------------
-- Cleanup: remove the seed rows so the test is re-runnable
-- ----------------------------------------------------------------------------
DELETE FROM __mj.ApplicationEntity WHERE ID = @AE_Survivor;
IF @AL_WasSeeded = 1
    DELETE FROM __mj.ActionLibrary WHERE ID = @AL_Survivor;

PRINT '';
PRINT '============================================================';
PRINT 'All assertions passed. Seed rows cleaned up.';
PRINT '============================================================';
