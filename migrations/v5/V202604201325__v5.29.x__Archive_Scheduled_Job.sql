-- Migration: Create "Run All Active Archives" action and daily scheduled job
-- The action queries all active ArchiveConfigurations and runs each one.
-- The scheduled job fires at 2:00 AM Central Time (America/Chicago) daily.

------------------------------------------------------
-- 1) Run All Active Archives action
------------------------------------------------------
DECLARE @ArchiveCategoryID UNIQUEIDENTIFIER = '0FADE0AA-E3BA-4A73-9D31-96B81B3D59AF';
DECLARE @RunAllActionID UNIQUEIDENTIFIER = 'D65B5245-2A54-42EA-8CC6-85689A9E765F';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Action] WHERE [Name] = 'Run All Active Archives')
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateAction
        @ID              = @RunAllActionID,
        @CategoryID      = @ArchiveCategoryID,
        @Name            = N'Run All Active Archives',
        @Description     = N'Discovers all active Archive Configurations and executes each one sequentially. Designed for scheduled daily runs — no parameters required.',
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
        @DriverClass     = N'Run All Active Archives',
        @ParentID        = NULL,
        @IconClass       = N'fa-solid fa-boxes-stacked',
        @DefaultCompactPromptID = NULL,
        @Config          = NULL;
END

------------------------------------------------------
-- 2) Daily scheduled job — 2:00 AM Central Time
------------------------------------------------------
DECLARE @ScheduledActionID UNIQUEIDENTIFIER = '41912D10-E0D1-4F98-A2CC-56FC56215EB1';
DECLARE @SystemUserID UNIQUEIDENTIFIER = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ScheduledAction] WHERE [Name] = 'Daily Archive Run')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ScheduledAction]
        ([ID], [Name], [Description], [CreatedByUserID], [ActionID],
         [Type], [CronExpression], [Timezone], [Status])
    VALUES
        (@ScheduledActionID,
         N'Daily Archive Run',
         N'Runs all active archive configurations once per day at 2:00 AM Central Time.',
         @SystemUserID,
         @RunAllActionID,
         N'Custom',
         N'0 2 * * *',
         N'America/Chicago',
         N'Disabled');
END
