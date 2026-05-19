-- Migration: Seed Action records for the Archive Data and Restore Archived Record actions
-- These actions are implemented by @memberjunction/archiving-action and registered via
-- @RegisterClass(BaseAction, 'Archive Data') / @RegisterClass(BaseAction, 'Restore Archived Record').
-- The database Action records are required for the MJ Action Engine to discover and execute them.

------------------------------------------------------
-- 0) Archive action category
------------------------------------------------------
DECLARE @ArchiveCategoryID UNIQUEIDENTIFIER = '0FADE0AA-E3BA-4A73-9D31-96B81B3D59AF';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ActionCategory] WHERE [ID] = @ArchiveCategoryID)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ActionCategory] ([ID], [Name], [Description], [ParentID])
    VALUES (@ArchiveCategoryID, N'Archive', N'Actions related to data archiving, restoration, and lifecycle management.', NULL);
END

------------------------------------------------------
-- 1) Archive Data action
------------------------------------------------------
DECLARE @ArchiveActionID UNIQUEIDENTIFIER = 'F7481B20-E85D-4C74-A5BE-CD9B4FADB131';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Action] WHERE [Name] = 'Archive Data')
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateAction
        @ID              = @ArchiveActionID,
        @CategoryID      = @ArchiveCategoryID,
        @Name            = N'Archive Data',
        @Description     = N'Executes an archive run for a given Archive Configuration. Archives eligible records to external storage based on retention rules, field configuration, and entity settings.',
        @Type            = N'Custom',
        @UserPrompt      = NULL,
        @UserComments    = NULL,
        @Code            = NULL,
        @CodeComments    = NULL,
        @CodeApprovalStatus = N'Approved',
        @CodeApprovalComments = NULL,
        @CodeApprovedByUserID = NULL,
        @CodeApprovedAt  = NULL,
        @CodeLocked      = 1,
        @ForceCodeGeneration = 0,
        @RetentionPeriod = NULL,
        @Status          = N'Active',
        @DriverClass     = N'Archive Data',
        @ParentID        = NULL,
        @IconClass       = N'fa-solid fa-box-archive',
        @DefaultCompactPromptID = NULL,
        @Config          = NULL;
END

-- Archive Data: ConfigurationID input param
DECLARE @ArchiveParamID UNIQUEIDENTIFIER = '611417D2-183B-42DE-93A1-EB83FAD64C5E';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ActionParam] WHERE [ActionID] = @ArchiveActionID AND [Name] = 'ConfigurationID')
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateActionParam
        @ID          = @ArchiveParamID,
        @ActionID    = @ArchiveActionID,
        @Name        = N'ConfigurationID',
        @DefaultValue = NULL,
        @Type        = N'Input',
        @ValueType   = N'Scalar',
        @IsArray     = 0,
        @Description = N'ID (UUID) of the MJ: Archive Configuration record to execute. The configuration must be active and have at least one entity configured.',
        @IsRequired  = 1,
        @MediaModality = NULL;
END

------------------------------------------------------
-- 2) Restore Archived Record action
------------------------------------------------------
DECLARE @RestoreActionID UNIQUEIDENTIFIER = '5433037C-7B58-40E6-8044-48D7C11A398D';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Action] WHERE [Name] = 'Restore Archived Record')
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateAction
        @ID              = @RestoreActionID,
        @CategoryID      = @ArchiveCategoryID,
        @Name            = N'Restore Archived Record',
        @Description     = N'Restores a previously archived record version by reading the archived field data from storage and writing it back to the database record.',
        @Type            = N'Custom',
        @UserPrompt      = NULL,
        @UserComments    = NULL,
        @Code            = NULL,
        @CodeComments    = NULL,
        @CodeApprovalStatus = N'Approved',
        @CodeApprovalComments = NULL,
        @CodeApprovedByUserID = NULL,
        @CodeApprovedAt  = NULL,
        @CodeLocked      = 1,
        @ForceCodeGeneration = 0,
        @RetentionPeriod = NULL,
        @Status          = N'Active',
        @DriverClass     = N'Restore Archived Record',
        @ParentID        = NULL,
        @IconClass       = N'fa-solid fa-rotate-left',
        @DefaultCompactPromptID = NULL,
        @Config          = NULL;
END

-- Restore Archived Record: ArchiveRunDetailID input param
DECLARE @RestoreParamID UNIQUEIDENTIFIER = '4EA1569C-F850-417A-9901-C7CB2B829A74';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ActionParam] WHERE [ActionID] = @RestoreActionID AND [Name] = 'ArchiveRunDetailID')
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateActionParam
        @ID          = @RestoreParamID,
        @ActionID    = @RestoreActionID,
        @Name        = N'ArchiveRunDetailID',
        @DefaultValue = NULL,
        @Type        = N'Input',
        @ValueType   = N'Scalar',
        @IsArray     = 0,
        @Description = N'ID (UUID) of the MJ: Archive Run Detail record to restore. The detail record contains the storage path and entity/record reference needed for restoration.',
        @IsRequired  = 1,
        @MediaModality = NULL;
END
