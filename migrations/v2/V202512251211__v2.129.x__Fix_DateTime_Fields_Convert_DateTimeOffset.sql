-- Migration: Convert datetime columns to datetimeoffset in ${flyway:defaultSchema} schema
-- Existing values will be converted with +00:00 (UTC) offset
-- This version dynamically looks up constraint names to avoid hard-coded references

-- =====================================================
-- HELPER: Dynamic constraint drop and recreate procedure
-- =====================================================

-- Temporarily create a helper procedure for this migration
IF OBJECT_ID('tempdb..#AlterColumnWithConstraint') IS NOT NULL
    DROP PROCEDURE #AlterColumnWithConstraint;
GO

CREATE PROCEDURE #AlterColumnWithConstraint
    @SchemaName NVARCHAR(128),
    @TableName NVARCHAR(128),
    @ColumnName NVARCHAR(128),
    @NewDataType NVARCHAR(50),
    @IsNullable BIT,
    @NewDefaultExpression NVARCHAR(MAX)
AS
BEGIN
    DECLARE @ConstraintName NVARCHAR(128);
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @NullSpec NVARCHAR(10) = CASE WHEN @IsNullable = 1 THEN 'NULL' ELSE 'NOT NULL' END;

    -- Find existing default constraint if any
    SELECT TOP 1 @ConstraintName = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
    INNER JOIN sys.tables t ON c.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = @SchemaName
      AND t.name = @TableName
      AND c.name = @ColumnName;

    -- Drop existing constraint if found
    IF @ConstraintName IS NOT NULL
    BEGIN
        SET @SQL = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] DROP CONSTRAINT [' + @ConstraintName + '];';
        PRINT 'Dropping constraint: ' + @ConstraintName;
        EXEC sp_executesql @SQL;
    END
    ELSE
    BEGIN
        PRINT 'No existing constraint found for ' + @SchemaName + '.' + @TableName + '.' + @ColumnName;
    END

    -- Alter the column
    SET @SQL = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] ALTER COLUMN [' + @ColumnName + '] ' + @NewDataType + ' ' + @NullSpec + ';';
    PRINT 'Altering column: ' + @SchemaName + '.' + @TableName + '.' + @ColumnName;
    EXEC sp_executesql @SQL;

    -- Recreate constraint if a default was provided
    IF @NewDefaultExpression IS NOT NULL
    BEGIN
        -- Generate a consistent constraint name
        DECLARE @NewConstraintName NVARCHAR(128) = 'DF_' + @TableName + '_' + @ColumnName;

        SET @SQL = 'ALTER TABLE [' + @SchemaName + '].[' + @TableName + '] ADD CONSTRAINT [' + @NewConstraintName + '] DEFAULT (' + @NewDefaultExpression + ') FOR [' + @ColumnName + '];';
        PRINT 'Creating constraint: ' + @NewConstraintName;
        EXEC sp_executesql @SQL;
    END
END;
GO

-- =====================================================
-- COLUMNS WITH DEFAULT CONSTRAINTS
-- Using the helper procedure to safely handle constraints
-- =====================================================

PRINT '=== Processing columns with default constraints ===';

-- CompanyIntegrationRunAPILog.ExecutedAt
EXEC #AlterColumnWithConstraint
    @SchemaName = '${flyway:defaultSchema}',
    @TableName = 'CompanyIntegrationRunAPILog',
    @ColumnName = 'ExecutedAt',
    @NewDataType = 'datetimeoffset(7)',
    @IsNullable = 0,
    @NewDefaultExpression = 'SYSDATETIMEOFFSET()';

-- CompanyIntegrationRunDetail.ExecutedAt
EXEC #AlterColumnWithConstraint
    @SchemaName = '${flyway:defaultSchema}',
    @TableName = 'CompanyIntegrationRunDetail',
    @ColumnName = 'ExecutedAt',
    @NewDataType = 'datetimeoffset(7)',
    @IsNullable = 0,
    @NewDefaultExpression = 'SYSDATETIMEOFFSET()';

-- DuplicateRun.StartedAt
EXEC #AlterColumnWithConstraint
    @SchemaName = '${flyway:defaultSchema}',
    @TableName = 'DuplicateRun',
    @ColumnName = 'StartedAt',
    @NewDataType = 'datetimeoffset(7)',
    @IsNullable = 0,
    @NewDefaultExpression = 'SYSDATETIMEOFFSET()';

-- DuplicateRunDetailMatch.MatchedAt
EXEC #AlterColumnWithConstraint
    @SchemaName = '${flyway:defaultSchema}',
    @TableName = 'DuplicateRunDetailMatch',
    @ColumnName = 'MatchedAt',
    @NewDataType = 'datetimeoffset(7)',
    @IsNullable = 0,
    @NewDefaultExpression = 'SYSDATETIMEOFFSET()';

-- DuplicateRunDetailMatch.MergedAt
EXEC #AlterColumnWithConstraint
    @SchemaName = '${flyway:defaultSchema}',
    @TableName = 'DuplicateRunDetailMatch',
    @ColumnName = 'MergedAt',
    @NewDataType = 'datetimeoffset(7)',
    @IsNullable = 0,
    @NewDefaultExpression = 'SYSDATETIMEOFFSET()';

-- Queue.LastHeartbeat
EXEC #AlterColumnWithConstraint
    @SchemaName = '${flyway:defaultSchema}',
    @TableName = 'Queue',
    @ColumnName = 'LastHeartbeat',
    @NewDataType = 'datetimeoffset(7)',
    @IsNullable = 0,
    @NewDefaultExpression = 'SYSDATETIMEOFFSET()';

-- RecordMergeLog.ProcessingStartedAt
EXEC #AlterColumnWithConstraint
    @SchemaName = '${flyway:defaultSchema}',
    @TableName = 'RecordMergeLog',
    @ColumnName = 'ProcessingStartedAt',
    @NewDataType = 'datetimeoffset(7)',
    @IsNullable = 0,
    @NewDefaultExpression = 'SYSDATETIMEOFFSET()';

-- TestRunFeedback.ReviewedAt
EXEC #AlterColumnWithConstraint
    @SchemaName = '${flyway:defaultSchema}',
    @TableName = 'TestRunFeedback',
    @ColumnName = 'ReviewedAt',
    @NewDataType = 'datetimeoffset(7)',
    @IsNullable = 0,
    @NewDefaultExpression = 'SYSDATETIMEOFFSET()';

-- UserRecordLog.EarliestAt
EXEC #AlterColumnWithConstraint
    @SchemaName = '${flyway:defaultSchema}',
    @TableName = 'UserRecordLog',
    @ColumnName = 'EarliestAt',
    @NewDataType = 'datetimeoffset(7)',
    @IsNullable = 0,
    @NewDefaultExpression = 'SYSDATETIMEOFFSET()';

-- UserRecordLog.LatestAt
EXEC #AlterColumnWithConstraint
    @SchemaName = '${flyway:defaultSchema}',
    @TableName = 'UserRecordLog',
    @ColumnName = 'LatestAt',
    @NewDataType = 'datetimeoffset(7)',
    @IsNullable = 0,
    @NewDefaultExpression = 'SYSDATETIMEOFFSET()';

PRINT '=== Completed columns with default constraints ===';

-- =====================================================
-- COLUMNS WITHOUT DEFAULT CONSTRAINTS
-- Simple ALTER COLUMN statements
-- =====================================================

PRINT '=== Processing columns without default constraints ===';

-- Action
ALTER TABLE [${flyway:defaultSchema}].[Action] ALTER COLUMN [CodeApprovedAt] datetimeoffset(7) NULL;

-- AIAgentRequest
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRequest] ALTER COLUMN [RequestedAt] datetimeoffset(7) NOT NULL;
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRequest] ALTER COLUMN [RespondedAt] datetimeoffset(7) NULL;

-- AIPromptRun
ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] ALTER COLUMN [FirstAttemptAt] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] ALTER COLUMN [LastAttemptAt] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] ALTER COLUMN [OriginalRequestStartTime] datetimeoffset(7) NULL;

-- CommunicationLog
ALTER TABLE [${flyway:defaultSchema}].[CommunicationLog] ALTER COLUMN [MessageDate] datetimeoffset(7) NOT NULL;

-- CommunicationRun
ALTER TABLE [${flyway:defaultSchema}].[CommunicationRun] ALTER COLUMN [EndedAt] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[CommunicationRun] ALTER COLUMN [StartedAt] datetimeoffset(7) NULL;

-- CompanyIntegration
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegration] ALTER COLUMN [TokenExpirationDate] datetimeoffset(7) NULL;

-- CompanyIntegrationRun
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationRun] ALTER COLUMN [EndedAt] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationRun] ALTER COLUMN [StartedAt] datetimeoffset(7) NULL;

-- ContentProcessRun
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRun] ALTER COLUMN [EndTime] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRun] ALTER COLUMN [StartTime] datetimeoffset(7) NULL;

-- DataContext
ALTER TABLE [${flyway:defaultSchema}].[DataContext] ALTER COLUMN [LastRefreshedAt] datetimeoffset(7) NULL;

-- DataContextItem
ALTER TABLE [${flyway:defaultSchema}].[DataContextItem] ALTER COLUMN [LastRefreshedAt] datetimeoffset(7) NULL;

-- DuplicateRun
ALTER TABLE [${flyway:defaultSchema}].[DuplicateRun] ALTER COLUMN [EndedAt] datetimeoffset(7) NULL;

-- DuplicateRunDetailMatch (already handled MatchedAt and MergedAt above)

-- EntityDocumentRun
ALTER TABLE [${flyway:defaultSchema}].[EntityDocumentRun] ALTER COLUMN [EndedAt] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[EntityDocumentRun] ALTER COLUMN [StartedAt] datetimeoffset(7) NULL;

-- EntityRecordDocument
ALTER TABLE [${flyway:defaultSchema}].[EntityRecordDocument] ALTER COLUMN [EntityRecordUpdatedAt] datetimeoffset(7) NOT NULL;

-- QueueTask
ALTER TABLE [${flyway:defaultSchema}].[QueueTask] ALTER COLUMN [EndedAt] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[QueueTask] ALTER COLUMN [StartedAt] datetimeoffset(7) NULL;

-- RecommendationRun
ALTER TABLE [${flyway:defaultSchema}].[RecommendationRun] ALTER COLUMN [EndDate] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[RecommendationRun] ALTER COLUMN [StartDate] datetimeoffset(7) NOT NULL;

-- RecordChangeReplayRun
ALTER TABLE [${flyway:defaultSchema}].[RecordChangeReplayRun] ALTER COLUMN [EndedAt] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[RecordChangeReplayRun] ALTER COLUMN [StartedAt] datetimeoffset(7) NOT NULL;

-- RecordMergeLog (already handled ProcessingStartedAt above)
ALTER TABLE [${flyway:defaultSchema}].[RecordMergeLog] ALTER COLUMN [ProcessingEndedAt] datetimeoffset(7) NULL;

-- Template
ALTER TABLE [${flyway:defaultSchema}].[Template] ALTER COLUMN [ActiveAt] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[Template] ALTER COLUMN [DisabledAt] datetimeoffset(7) NULL;

-- TestRun
ALTER TABLE [${flyway:defaultSchema}].[TestRun] ALTER COLUMN [CompletedAt] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[TestRun] ALTER COLUMN [StartedAt] datetimeoffset(7) NULL;

-- TestSuiteRun
ALTER TABLE [${flyway:defaultSchema}].[TestSuiteRun] ALTER COLUMN [CompletedAt] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[TestSuiteRun] ALTER COLUMN [StartedAt] datetimeoffset(7) NULL;

-- UserNotification
ALTER TABLE [${flyway:defaultSchema}].[UserNotification] ALTER COLUMN [ReadAt] datetimeoffset(7) NULL;

-- UserViewRun
ALTER TABLE [${flyway:defaultSchema}].[UserViewRun] ALTER COLUMN [RunAt] datetimeoffset(7) NOT NULL;

-- VersionInstallation
ALTER TABLE [${flyway:defaultSchema}].[VersionInstallation] ALTER COLUMN [InstalledAt] datetimeoffset(7) NOT NULL;

-- WorkflowRun
ALTER TABLE [${flyway:defaultSchema}].[WorkflowRun] ALTER COLUMN [EndedAt] datetimeoffset(7) NULL;
ALTER TABLE [${flyway:defaultSchema}].[WorkflowRun] ALTER COLUMN [StartedAt] datetimeoffset(7) NOT NULL;













-- CODE GEN RUN
/* Index for Foreign Keys for Action */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_CategoryID ON [${flyway:defaultSchema}].[Action] ([CategoryID]);

-- Index for foreign key CodeApprovedByUserID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_CodeApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_CodeApprovedByUserID ON [${flyway:defaultSchema}].[Action] ([CodeApprovedByUserID]);

-- Index for foreign key ParentID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_ParentID ON [${flyway:defaultSchema}].[Action] ([ParentID]);

-- Index for foreign key DefaultCompactPromptID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_DefaultCompactPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_DefaultCompactPromptID ON [${flyway:defaultSchema}].[Action] ([DefaultCompactPromptID]);

/* Root ID Function SQL for Actions.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: fnActionParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Action].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnActionParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnActionParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnActionParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Action]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Action] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* Base View SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: vwActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Actions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Action
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwActions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwActions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActions]
AS
SELECT
    a.*,
    ActionCategory_CategoryID.[Name] AS [Category],
    User_CodeApprovedByUserID.[Name] AS [CodeApprovedByUser],
    Action_ParentID.[Name] AS [Parent],
    AIPrompt_DefaultCompactPromptID.[Name] AS [DefaultCompactPrompt],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[Action] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ActionCategory] AS ActionCategory_CategoryID
  ON
    [a].[CategoryID] = ActionCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_CodeApprovedByUserID
  ON
    [a].[CodeApprovedByUserID] = User_CodeApprovedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ParentID
  ON
    [a].[ParentID] = Action_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_DefaultCompactPromptID
  ON
    [a].[DefaultCompactPromptID] = AIPrompt_DefaultCompactPromptID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnActionParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: Permissions for vwActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: spCreateAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAction]
    @ID uniqueidentifier = NULL,
    @CategoryID uniqueidentifier,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20) = NULL,
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20) = NULL,
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID uniqueidentifier,
    @CodeApprovedAt datetimeoffset,
    @CodeLocked bit = NULL,
    @ForceCodeGeneration bit = NULL,
    @RetentionPeriod int,
    @Status nvarchar(20) = NULL,
    @DriverClass nvarchar(255),
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100),
    @DefaultCompactPromptID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Action]
            (
                [ID],
                [CategoryID],
                [Name],
                [Description],
                [Type],
                [UserPrompt],
                [UserComments],
                [Code],
                [CodeComments],
                [CodeApprovalStatus],
                [CodeApprovalComments],
                [CodeApprovedByUserID],
                [CodeApprovedAt],
                [CodeLocked],
                [ForceCodeGeneration],
                [RetentionPeriod],
                [Status],
                [DriverClass],
                [ParentID],
                [IconClass],
                [DefaultCompactPromptID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CategoryID,
                @Name,
                @Description,
                ISNULL(@Type, 'Generated'),
                @UserPrompt,
                @UserComments,
                @Code,
                @CodeComments,
                ISNULL(@CodeApprovalStatus, 'Pending'),
                @CodeApprovalComments,
                @CodeApprovedByUserID,
                @CodeApprovedAt,
                ISNULL(@CodeLocked, 0),
                ISNULL(@ForceCodeGeneration, 0),
                @RetentionPeriod,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @ParentID,
                @IconClass,
                @DefaultCompactPromptID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Action]
            (
                [CategoryID],
                [Name],
                [Description],
                [Type],
                [UserPrompt],
                [UserComments],
                [Code],
                [CodeComments],
                [CodeApprovalStatus],
                [CodeApprovalComments],
                [CodeApprovedByUserID],
                [CodeApprovedAt],
                [CodeLocked],
                [ForceCodeGeneration],
                [RetentionPeriod],
                [Status],
                [DriverClass],
                [ParentID],
                [IconClass],
                [DefaultCompactPromptID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CategoryID,
                @Name,
                @Description,
                ISNULL(@Type, 'Generated'),
                @UserPrompt,
                @UserComments,
                @Code,
                @CodeComments,
                ISNULL(@CodeApprovalStatus, 'Pending'),
                @CodeApprovalComments,
                @CodeApprovedByUserID,
                @CodeApprovedAt,
                ISNULL(@CodeLocked, 0),
                ISNULL(@ForceCodeGeneration, 0),
                @RetentionPeriod,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @ParentID,
                @IconClass,
                @DefaultCompactPromptID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAction] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAction] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: spUpdateAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAction]
    @ID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID uniqueidentifier,
    @CodeApprovedAt datetimeoffset,
    @CodeLocked bit,
    @ForceCodeGeneration bit,
    @RetentionPeriod int,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100),
    @DefaultCompactPromptID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Action]
    SET
        [CategoryID] = @CategoryID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [UserPrompt] = @UserPrompt,
        [UserComments] = @UserComments,
        [Code] = @Code,
        [CodeComments] = @CodeComments,
        [CodeApprovalStatus] = @CodeApprovalStatus,
        [CodeApprovalComments] = @CodeApprovalComments,
        [CodeApprovedByUserID] = @CodeApprovedByUserID,
        [CodeApprovedAt] = @CodeApprovedAt,
        [CodeLocked] = @CodeLocked,
        [ForceCodeGeneration] = @ForceCodeGeneration,
        [RetentionPeriod] = @RetentionPeriod,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [ParentID] = @ParentID,
        [IconClass] = @IconClass,
        [DefaultCompactPromptID] = @DefaultCompactPromptID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwActions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAction] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Action table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAction]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAction];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAction
ON [${flyway:defaultSchema}].[Action]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Action]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Action] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAction] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: spDeleteAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Action]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration]
    

/* spDelete Permissions for Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration]



/* Index for Foreign Keys for AIAgentRequest */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRequest_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRequest_AgentID ON [${flyway:defaultSchema}].[AIAgentRequest] ([AgentID]);

-- Index for foreign key RequestForUserID in table AIAgentRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRequest_RequestForUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRequest_RequestForUserID ON [${flyway:defaultSchema}].[AIAgentRequest] ([RequestForUserID]);

-- Index for foreign key ResponseByUserID in table AIAgentRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRequest_ResponseByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRequest_ResponseByUserID ON [${flyway:defaultSchema}].[AIAgentRequest] ([ResponseByUserID]);

/* Base View SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: vwAIAgentRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agent Requests
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRequest
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRequests]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRequests];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRequests]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    User_RequestForUserID.[Name] AS [RequestForUser],
    User_ResponseByUserID.[Name] AS [ResponseByUser]
FROM
    [${flyway:defaultSchema}].[AIAgentRequest] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_RequestForUserID
  ON
    [a].[RequestForUserID] = User_RequestForUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_ResponseByUserID
  ON
    [a].[ResponseByUserID] = User_ResponseByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: Permissions for vwAIAgentRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: spCreateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRequest]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @RequestedAt datetimeoffset,
    @RequestForUserID uniqueidentifier,
    @Status nvarchar(20),
    @Request nvarchar(MAX),
    @Response nvarchar(MAX),
    @ResponseByUserID uniqueidentifier,
    @RespondedAt datetimeoffset,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRequest]
            (
                [ID],
                [AgentID],
                [RequestedAt],
                [RequestForUserID],
                [Status],
                [Request],
                [Response],
                [ResponseByUserID],
                [RespondedAt],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @RequestedAt,
                @RequestForUserID,
                @Status,
                @Request,
                @Response,
                @ResponseByUserID,
                @RespondedAt,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRequest]
            (
                [AgentID],
                [RequestedAt],
                [RequestForUserID],
                [Status],
                [Request],
                [Response],
                [ResponseByUserID],
                [RespondedAt],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @RequestedAt,
                @RequestForUserID,
                @Status,
                @Request,
                @Response,
                @ResponseByUserID,
                @RespondedAt,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRequests] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: spUpdateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRequest]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @RequestedAt datetimeoffset,
    @RequestForUserID uniqueidentifier,
    @Status nvarchar(20),
    @Request nvarchar(MAX),
    @Response nvarchar(MAX),
    @ResponseByUserID uniqueidentifier,
    @RespondedAt datetimeoffset,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRequest]
    SET
        [AgentID] = @AgentID,
        [RequestedAt] = @RequestedAt,
        [RequestForUserID] = @RequestForUserID,
        [Status] = @Status,
        [Request] = @Request,
        [Response] = @Response,
        [ResponseByUserID] = @ResponseByUserID,
        [RespondedAt] = @RespondedAt,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRequests] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRequests]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRequest table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRequest]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRequest];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRequest
ON [${flyway:defaultSchema}].[AIAgentRequest]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRequest]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRequest] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: spDeleteAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRequest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRequest]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRequest] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRequest] TO [cdp_Integration]



/* Index for Foreign Keys for CommunicationLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CommunicationProviderID in table CommunicationLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CommunicationLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationProviderID ON [${flyway:defaultSchema}].[CommunicationLog] ([CommunicationProviderID]);

-- Index for foreign key CommunicationProviderMessageTypeID in table CommunicationLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationProviderMessageTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CommunicationLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationProviderMessageTypeID ON [${flyway:defaultSchema}].[CommunicationLog] ([CommunicationProviderMessageTypeID]);

-- Index for foreign key CommunicationRunID in table CommunicationLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CommunicationLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationRunID ON [${flyway:defaultSchema}].[CommunicationLog] ([CommunicationRunID]);

/* Base View SQL for Communication Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: vwCommunicationLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Communication Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CommunicationLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCommunicationLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCommunicationLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCommunicationLogs]
AS
SELECT
    c.*,
    CommunicationProvider_CommunicationProviderID.[Name] AS [CommunicationProvider],
    CommunicationProviderMessageType_CommunicationProviderMessageTypeID.[Name] AS [CommunicationProviderMessageType],
    CommunicationRun_CommunicationRunID.[User] AS [CommunicationRun]
FROM
    [${flyway:defaultSchema}].[CommunicationLog] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CommunicationProvider] AS CommunicationProvider_CommunicationProviderID
  ON
    [c].[CommunicationProviderID] = CommunicationProvider_CommunicationProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[CommunicationProviderMessageType] AS CommunicationProviderMessageType_CommunicationProviderMessageTypeID
  ON
    [c].[CommunicationProviderMessageTypeID] = CommunicationProviderMessageType_CommunicationProviderMessageTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwCommunicationRuns] AS CommunicationRun_CommunicationRunID
  ON
    [c].[CommunicationRunID] = CommunicationRun_CommunicationRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationLogs] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for Communication Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: Permissions for vwCommunicationLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationLogs] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Communication Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: spCreateCommunicationLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommunicationLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCommunicationLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationLog]
    @ID uniqueidentifier = NULL,
    @CommunicationProviderID uniqueidentifier,
    @CommunicationProviderMessageTypeID uniqueidentifier,
    @CommunicationRunID uniqueidentifier,
    @Direction nvarchar(20),
    @MessageDate datetimeoffset,
    @Status nvarchar(20) = NULL,
    @MessageContent nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CommunicationLog]
            (
                [ID],
                [CommunicationProviderID],
                [CommunicationProviderMessageTypeID],
                [CommunicationRunID],
                [Direction],
                [MessageDate],
                [Status],
                [MessageContent],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CommunicationProviderID,
                @CommunicationProviderMessageTypeID,
                @CommunicationRunID,
                @Direction,
                @MessageDate,
                ISNULL(@Status, 'Pending'),
                @MessageContent,
                @ErrorMessage
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CommunicationLog]
            (
                [CommunicationProviderID],
                [CommunicationProviderMessageTypeID],
                [CommunicationRunID],
                [Direction],
                [MessageDate],
                [Status],
                [MessageContent],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CommunicationProviderID,
                @CommunicationProviderMessageTypeID,
                @CommunicationRunID,
                @Direction,
                @MessageDate,
                ISNULL(@Status, 'Pending'),
                @MessageContent,
                @ErrorMessage
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCommunicationLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Communication Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Communication Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: spUpdateCommunicationLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommunicationLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCommunicationLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationLog]
    @ID uniqueidentifier,
    @CommunicationProviderID uniqueidentifier,
    @CommunicationProviderMessageTypeID uniqueidentifier,
    @CommunicationRunID uniqueidentifier,
    @Direction nvarchar(20),
    @MessageDate datetimeoffset,
    @Status nvarchar(20),
    @MessageContent nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationLog]
    SET
        [CommunicationProviderID] = @CommunicationProviderID,
        [CommunicationProviderMessageTypeID] = @CommunicationProviderMessageTypeID,
        [CommunicationRunID] = @CommunicationRunID,
        [Direction] = @Direction,
        [MessageDate] = @MessageDate,
        [Status] = @Status,
        [MessageContent] = @MessageContent,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCommunicationLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCommunicationLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommunicationLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCommunicationLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCommunicationLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCommunicationLog
ON [${flyway:defaultSchema}].[CommunicationLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CommunicationLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Communication Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Communication Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: spDeleteCommunicationLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommunicationLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCommunicationLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CommunicationLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationLog] TO [cdp_Integration]
    

/* spDelete Permissions for Communication Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationLog] TO [cdp_Integration]



/* Index for Foreign Keys for CommunicationRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table CommunicationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CommunicationRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CommunicationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CommunicationRun_UserID ON [${flyway:defaultSchema}].[CommunicationRun] ([UserID]);

/* Base View SQL for Communication Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: vwCommunicationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Communication Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CommunicationRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCommunicationRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCommunicationRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCommunicationRuns]
AS
SELECT
    c.*,
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[CommunicationRun] AS c
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Communication Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: Permissions for vwCommunicationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Communication Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: spCreateCommunicationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommunicationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCommunicationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationRun]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @Direction nvarchar(20),
    @Status nvarchar(20),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Comments nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CommunicationRun]
            (
                [ID],
                [UserID],
                [Direction],
                [Status],
                [StartedAt],
                [EndedAt],
                [Comments],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @Direction,
                @Status,
                @StartedAt,
                @EndedAt,
                @Comments,
                @ErrorMessage
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CommunicationRun]
            (
                [UserID],
                [Direction],
                [Status],
                [StartedAt],
                [EndedAt],
                [Comments],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @Direction,
                @Status,
                @StartedAt,
                @EndedAt,
                @Comments,
                @ErrorMessage
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCommunicationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Communication Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Communication Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: spUpdateCommunicationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommunicationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCommunicationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationRun]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @Direction nvarchar(20),
    @Status nvarchar(20),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Comments nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationRun]
    SET
        [UserID] = @UserID,
        [Direction] = @Direction,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Comments] = @Comments,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCommunicationRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCommunicationRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommunicationRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCommunicationRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCommunicationRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCommunicationRun
ON [${flyway:defaultSchema}].[CommunicationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CommunicationRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Communication Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Communication Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: spDeleteCommunicationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommunicationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCommunicationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CommunicationRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationRun] TO [cdp_Integration]
    

/* spDelete Permissions for Communication Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationRun] TO [cdp_Integration]



/* Index for Foreign Keys for CompanyIntegrationRunAPILog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationRunID in table CompanyIntegrationRunAPILog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRunAPILog_CompanyIntegrationRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRunAPILog_CompanyIntegrationRunID ON [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog] ([CompanyIntegrationRunID]);

/* Index for Foreign Keys for CompanyIntegrationRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationRunID in table CompanyIntegrationRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRunDetail_CompanyIntegrationRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRunDetail_CompanyIntegrationRunID ON [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] ([CompanyIntegrationRunID]);

-- Index for foreign key EntityID in table CompanyIntegrationRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRunDetail_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRunDetail_EntityID ON [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] ([EntityID]);

/* Base View Permissions SQL for Company Integration Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run Details
-- Item: Permissions for vwCompanyIntegrationRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationRunDetails] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Company Integration Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run Details
-- Item: spCreateCompanyIntegrationRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Action nchar(20),
    @ExecutedAt datetimeoffset = NULL,
    @IsSuccess bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
            (
                [ID],
                [CompanyIntegrationRunID],
                [EntityID],
                [RecordID],
                [Action],
                [ExecutedAt],
                [IsSuccess]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationRunID,
                @EntityID,
                @RecordID,
                @Action,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
            (
                [CompanyIntegrationRunID],
                [EntityID],
                [RecordID],
                [Action],
                [ExecutedAt],
                [IsSuccess]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationRunID,
                @EntityID,
                @RecordID,
                @Action,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Company Integration Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Company Integration Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run Details
-- Item: spUpdateCompanyIntegrationRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail]
    @ID uniqueidentifier,
    @CompanyIntegrationRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Action nchar(20),
    @ExecutedAt datetimeoffset,
    @IsSuccess bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
    SET
        [CompanyIntegrationRunID] = @CompanyIntegrationRunID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [Action] = @Action,
        [ExecutedAt] = @ExecutedAt,
        [IsSuccess] = @IsSuccess
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationRunDetail
ON [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Company Integration Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Company Integration Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run Details
-- Item: spDeleteCompanyIntegrationRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Company Integration Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for CompanyIntegrationRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationID in table CompanyIntegrationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_CompanyIntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_CompanyIntegrationID ON [${flyway:defaultSchema}].[CompanyIntegrationRun] ([CompanyIntegrationID]);

-- Index for foreign key RunByUserID in table CompanyIntegrationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_RunByUserID ON [${flyway:defaultSchema}].[CompanyIntegrationRun] ([RunByUserID]);

/* Base View Permissions SQL for Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Runs
-- Item: Permissions for vwCompanyIntegrationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Runs
-- Item: spCreateCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @TotalRecords int,
    @Comments nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @ErrorLog nvarchar(MAX),
    @ConfigData nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun]
            (
                [ID],
                [CompanyIntegrationID],
                [RunByUserID],
                [StartedAt],
                [EndedAt],
                [TotalRecords],
                [Comments],
                [Status],
                [ErrorLog],
                [ConfigData]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationID,
                @RunByUserID,
                @StartedAt,
                @EndedAt,
                @TotalRecords,
                @Comments,
                ISNULL(@Status, 'Pending'),
                @ErrorLog,
                @ConfigData
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun]
            (
                [CompanyIntegrationID],
                [RunByUserID],
                [StartedAt],
                [EndedAt],
                [TotalRecords],
                [Comments],
                [Status],
                [ErrorLog],
                [ConfigData]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationID,
                @RunByUserID,
                @StartedAt,
                @EndedAt,
                @TotalRecords,
                @Comments,
                ISNULL(@Status, 'Pending'),
                @ErrorLog,
                @ConfigData
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Company Integration Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Runs
-- Item: spUpdateCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun]
    @ID uniqueidentifier,
    @CompanyIntegrationID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @TotalRecords int,
    @Comments nvarchar(MAX),
    @Status nvarchar(20),
    @ErrorLog nvarchar(MAX),
    @ConfigData nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRun]
    SET
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [RunByUserID] = @RunByUserID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [TotalRecords] = @TotalRecords,
        [Comments] = @Comments,
        [Status] = @Status,
        [ErrorLog] = @ErrorLog,
        [ConfigData] = @ConfigData
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationRun
ON [${flyway:defaultSchema}].[CompanyIntegrationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Company Integration Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Runs
-- Item: spDeleteCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Company Integration Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for CompanyIntegration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID ON [${flyway:defaultSchema}].[CompanyIntegration] ([CompanyID]);

-- Index for foreign key IntegrationID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID ON [${flyway:defaultSchema}].[CompanyIntegration] ([IntegrationID]);

/* Base View Permissions SQL for Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integrations
-- Item: Permissions for vwCompanyIntegrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrations] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integrations
-- Item: spCreateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegration]
    @ID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetimeoffset,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit = NULL,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255),
    @Name nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (
                [ID],
                [CompanyID],
                [IntegrationID],
                [IsActive],
                [AccessToken],
                [RefreshToken],
                [TokenExpirationDate],
                [APIKey],
                [ExternalSystemID],
                [IsExternalSystemReadOnly],
                [ClientID],
                [ClientSecret],
                [CustomAttribute1],
                [Name]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyID,
                @IntegrationID,
                @IsActive,
                @AccessToken,
                @RefreshToken,
                @TokenExpirationDate,
                @APIKey,
                @ExternalSystemID,
                ISNULL(@IsExternalSystemReadOnly, 0),
                @ClientID,
                @ClientSecret,
                @CustomAttribute1,
                @Name
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (
                [CompanyID],
                [IntegrationID],
                [IsActive],
                [AccessToken],
                [RefreshToken],
                [TokenExpirationDate],
                [APIKey],
                [ExternalSystemID],
                [IsExternalSystemReadOnly],
                [ClientID],
                [ClientSecret],
                [CustomAttribute1],
                [Name]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyID,
                @IntegrationID,
                @IsActive,
                @AccessToken,
                @RefreshToken,
                @TokenExpirationDate,
                @APIKey,
                @ExternalSystemID,
                ISNULL(@IsExternalSystemReadOnly, 0),
                @ClientID,
                @ClientSecret,
                @CustomAttribute1,
                @Name
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integrations
-- Item: spUpdateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegration]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetimeoffset,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255),
    @Name nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegration]
    SET
        [CompanyID] = @CompanyID,
        [IntegrationID] = @IntegrationID,
        [IsActive] = @IsActive,
        [AccessToken] = @AccessToken,
        [RefreshToken] = @RefreshToken,
        [TokenExpirationDate] = @TokenExpirationDate,
        [APIKey] = @APIKey,
        [ExternalSystemID] = @ExternalSystemID,
        [IsExternalSystemReadOnly] = @IsExternalSystemReadOnly,
        [ClientID] = @ClientID,
        [ClientSecret] = @ClientSecret,
        [CustomAttribute1] = @CustomAttribute1,
        [Name] = @Name
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegration
ON [${flyway:defaultSchema}].[CompanyIntegration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integrations
-- Item: spDeleteCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* Base View SQL for Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: vwCompanyIntegrationRunAPILogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Company Integration Run API Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CompanyIntegrationRunAPILog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs]
AS
SELECT
    c.*,
    CompanyIntegrationRun_CompanyIntegrationRunID.[Integration] AS [CompanyIntegrationRun]
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog] AS c
INNER JOIN
    [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] AS CompanyIntegrationRun_CompanyIntegrationRunID
  ON
    [c].[CompanyIntegrationRunID] = CompanyIntegrationRun_CompanyIntegrationRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: Permissions for vwCompanyIntegrationRunAPILogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: spCreateCompanyIntegrationRunAPILog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationRunAPILog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationRunID uniqueidentifier,
    @ExecutedAt datetimeoffset = NULL,
    @IsSuccess bit = NULL,
    @RequestMethod nvarchar(12),
    @URL nvarchar(MAX),
    @Parameters nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
            (
                [ID],
                [CompanyIntegrationRunID],
                [ExecutedAt],
                [IsSuccess],
                [RequestMethod],
                [URL],
                [Parameters]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationRunID,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0),
                @RequestMethod,
                @URL,
                @Parameters
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
            (
                [CompanyIntegrationRunID],
                [ExecutedAt],
                [IsSuccess],
                [RequestMethod],
                [URL],
                [Parameters]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationRunID,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0),
                @RequestMethod,
                @URL,
                @Parameters
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Company Integration Run API Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: spUpdateCompanyIntegrationRunAPILog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationRunAPILog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog]
    @ID uniqueidentifier,
    @CompanyIntegrationRunID uniqueidentifier,
    @ExecutedAt datetimeoffset,
    @IsSuccess bit,
    @RequestMethod nvarchar(12),
    @URL nvarchar(MAX),
    @Parameters nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
    SET
        [CompanyIntegrationRunID] = @CompanyIntegrationRunID,
        [ExecutedAt] = @ExecutedAt,
        [IsSuccess] = @IsSuccess,
        [RequestMethod] = @RequestMethod,
        [URL] = @URL,
        [Parameters] = @Parameters
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRunAPILog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunAPILog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunAPILog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationRunAPILog
ON [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Company Integration Run API Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: spDeleteCompanyIntegrationRunAPILog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRunAPILog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunAPILog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunAPILog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunAPILog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Company Integration Run API Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for ContentProcessRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SourceID in table ContentProcessRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRun_SourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRun_SourceID ON [${flyway:defaultSchema}].[ContentProcessRun] ([SourceID]);

/* Base View SQL for Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: vwContentProcessRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Content Process Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentProcessRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentProcessRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentProcessRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentProcessRuns]
AS
SELECT
    c.*,
    ContentSource_SourceID.[Name] AS [Source]
FROM
    [${flyway:defaultSchema}].[ContentProcessRun] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS ContentSource_SourceID
  ON
    [c].[SourceID] = ContentSource_SourceID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: Permissions for vwContentProcessRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: spCreateContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRun]
    @ID uniqueidentifier = NULL,
    @SourceID uniqueidentifier,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @Status nvarchar(100),
    @ProcessedItems int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRun]
            (
                [ID],
                [SourceID],
                [StartTime],
                [EndTime],
                [Status],
                [ProcessedItems]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SourceID,
                @StartTime,
                @EndTime,
                @Status,
                @ProcessedItems
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRun]
            (
                [SourceID],
                [StartTime],
                [EndTime],
                [Status],
                [ProcessedItems]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SourceID,
                @StartTime,
                @EndTime,
                @Status,
                @ProcessedItems
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentProcessRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: spUpdateContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRun]
    @ID uniqueidentifier,
    @SourceID uniqueidentifier,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @Status nvarchar(100),
    @ProcessedItems int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRun]
    SET
        [SourceID] = @SourceID,
        [StartTime] = @StartTime,
        [EndTime] = @EndTime,
        [Status] = @Status,
        [ProcessedItems] = @ProcessedItems
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentProcessRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentProcessRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentProcessRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentProcessRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentProcessRun
ON [${flyway:defaultSchema}].[ContentProcessRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentProcessRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: spDeleteContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentProcessRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRun] TO [cdp_Integration]
    

/* spDelete Permissions for Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRun] TO [cdp_Integration]



/* Index for Foreign Keys for DataContextItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DataContextID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_DataContextID ON [${flyway:defaultSchema}].[DataContextItem] ([DataContextID]);

-- Index for foreign key ViewID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_ViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_ViewID ON [${flyway:defaultSchema}].[DataContextItem] ([ViewID]);

-- Index for foreign key QueryID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_QueryID ON [${flyway:defaultSchema}].[DataContextItem] ([QueryID]);

-- Index for foreign key EntityID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_EntityID ON [${flyway:defaultSchema}].[DataContextItem] ([EntityID]);

/* Base View SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: vwDataContextItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Data Context Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DataContextItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDataContextItems]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDataContextItems];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDataContextItems]
AS
SELECT
    d.*,
    DataContext_DataContextID.[Name] AS [DataContext],
    UserView_ViewID.[Name] AS [View],
    Query_QueryID.[Name] AS [Query],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[DataContextItem] AS d
INNER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [d].[DataContextID] = DataContext_DataContextID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserView] AS UserView_ViewID
  ON
    [d].[ViewID] = UserView_ViewID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Query] AS Query_QueryID
  ON
    [d].[QueryID] = Query_QueryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [d].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDataContextItems] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: Permissions for vwDataContextItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDataContextItems] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: spCreateDataContextItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DataContextItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDataContextItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDataContextItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDataContextItem]
    @ID uniqueidentifier = NULL,
    @DataContextID uniqueidentifier,
    @Type nvarchar(50),
    @ViewID uniqueidentifier,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @SQL nvarchar(MAX),
    @DataJSON nvarchar(MAX),
    @LastRefreshedAt datetimeoffset,
    @Description nvarchar(MAX),
    @CodeName nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DataContextItem]
            (
                [ID],
                [DataContextID],
                [Type],
                [ViewID],
                [QueryID],
                [EntityID],
                [RecordID],
                [SQL],
                [DataJSON],
                [LastRefreshedAt],
                [Description],
                [CodeName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DataContextID,
                @Type,
                @ViewID,
                @QueryID,
                @EntityID,
                @RecordID,
                @SQL,
                @DataJSON,
                @LastRefreshedAt,
                @Description,
                @CodeName
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DataContextItem]
            (
                [DataContextID],
                [Type],
                [ViewID],
                [QueryID],
                [EntityID],
                [RecordID],
                [SQL],
                [DataJSON],
                [LastRefreshedAt],
                [Description],
                [CodeName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DataContextID,
                @Type,
                @ViewID,
                @QueryID,
                @EntityID,
                @RecordID,
                @SQL,
                @DataJSON,
                @LastRefreshedAt,
                @Description,
                @CodeName
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDataContextItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Data Context Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: spUpdateDataContextItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DataContextItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDataContextItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDataContextItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDataContextItem]
    @ID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Type nvarchar(50),
    @ViewID uniqueidentifier,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @SQL nvarchar(MAX),
    @DataJSON nvarchar(MAX),
    @LastRefreshedAt datetimeoffset,
    @Description nvarchar(MAX),
    @CodeName nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DataContextItem]
    SET
        [DataContextID] = @DataContextID,
        [Type] = @Type,
        [ViewID] = @ViewID,
        [QueryID] = @QueryID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [SQL] = @SQL,
        [DataJSON] = @DataJSON,
        [LastRefreshedAt] = @LastRefreshedAt,
        [Description] = @Description,
        [CodeName] = @CodeName
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDataContextItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDataContextItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DataContextItem table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDataContextItem]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDataContextItem];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDataContextItem
ON [${flyway:defaultSchema}].[DataContextItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DataContextItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DataContextItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Data Context Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: spDeleteDataContextItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DataContextItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDataContextItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDataContextItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDataContextItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DataContextItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Data Context Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for DataContext */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table DataContext
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContext_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContext]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContext_UserID ON [${flyway:defaultSchema}].[DataContext] ([UserID]);

/* Index for Foreign Keys for DuplicateRunDetailMatch */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DuplicateRunDetailID in table DuplicateRunDetailMatch
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_DuplicateRunDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRunDetailMatch]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_DuplicateRunDetailID ON [${flyway:defaultSchema}].[DuplicateRunDetailMatch] ([DuplicateRunDetailID]);

-- Index for foreign key RecordMergeLogID in table DuplicateRunDetailMatch
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_RecordMergeLogID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRunDetailMatch]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_RecordMergeLogID ON [${flyway:defaultSchema}].[DuplicateRunDetailMatch] ([RecordMergeLogID]);

/* Base View SQL for Data Contexts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: vwDataContexts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Data Contexts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DataContext
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDataContexts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDataContexts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDataContexts]
AS
SELECT
    d.*,
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[DataContext] AS d
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDataContexts] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for Data Contexts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: Permissions for vwDataContexts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDataContexts] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Data Contexts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: spCreateDataContext
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DataContext
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDataContext]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDataContext];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDataContext]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @LastRefreshedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DataContext]
            (
                [ID],
                [Name],
                [Description],
                [UserID],
                [LastRefreshedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @UserID,
                @LastRefreshedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DataContext]
            (
                [Name],
                [Description],
                [UserID],
                [LastRefreshedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @UserID,
                @LastRefreshedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDataContexts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for Data Contexts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for Data Contexts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: spUpdateDataContext
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DataContext
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDataContext]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDataContext];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDataContext]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @LastRefreshedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DataContext]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID,
        [LastRefreshedAt] = @LastRefreshedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDataContexts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDataContexts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DataContext table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDataContext]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDataContext];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDataContext
ON [${flyway:defaultSchema}].[DataContext]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DataContext]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DataContext] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Data Contexts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for Data Contexts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: spDeleteDataContext
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DataContext
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDataContext]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDataContext];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDataContext]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DataContext]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spDelete Permissions for Data Contexts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* Base View SQL for Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: vwDuplicateRunDetailMatches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Duplicate Run Detail Matches
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DuplicateRunDetailMatch
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDuplicateRunDetailMatches]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches]
AS
SELECT
    d.*,
    DuplicateRunDetail_DuplicateRunDetailID.[RecordID] AS [DuplicateRunDetail],
    RecordMergeLog_RecordMergeLogID.[SurvivingRecordID] AS [RecordMergeLog]
FROM
    [${flyway:defaultSchema}].[DuplicateRunDetailMatch] AS d
INNER JOIN
    [${flyway:defaultSchema}].[DuplicateRunDetail] AS DuplicateRunDetail_DuplicateRunDetailID
  ON
    [d].[DuplicateRunDetailID] = DuplicateRunDetail_DuplicateRunDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RecordMergeLog] AS RecordMergeLog_RecordMergeLogID
  ON
    [d].[RecordMergeLogID] = RecordMergeLog_RecordMergeLogID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: Permissions for vwDuplicateRunDetailMatches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: spCreateDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch]
    @ID uniqueidentifier = NULL,
    @DuplicateRunDetailID uniqueidentifier,
    @MatchSource nvarchar(20) = NULL,
    @MatchRecordID nvarchar(500),
    @MatchProbability numeric(12, 11) = NULL,
    @MatchedAt datetimeoffset = NULL,
    @Action nvarchar(20) = NULL,
    @ApprovalStatus nvarchar(20) = NULL,
    @RecordMergeLogID uniqueidentifier,
    @MergeStatus nvarchar(20) = NULL,
    @MergedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
            (
                [ID],
                [DuplicateRunDetailID],
                [MatchSource],
                [MatchRecordID],
                [MatchProbability],
                [MatchedAt],
                [Action],
                [ApprovalStatus],
                [RecordMergeLogID],
                [MergeStatus],
                [MergedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DuplicateRunDetailID,
                ISNULL(@MatchSource, 'Vector'),
                @MatchRecordID,
                ISNULL(@MatchProbability, 0),
                ISNULL(@MatchedAt, sysdatetimeoffset()),
                ISNULL(@Action, 'Ignore'),
                ISNULL(@ApprovalStatus, 'Pending'),
                @RecordMergeLogID,
                ISNULL(@MergeStatus, 'Pending'),
                ISNULL(@MergedAt, sysdatetimeoffset())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
            (
                [DuplicateRunDetailID],
                [MatchSource],
                [MatchRecordID],
                [MatchProbability],
                [MatchedAt],
                [Action],
                [ApprovalStatus],
                [RecordMergeLogID],
                [MergeStatus],
                [MergedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DuplicateRunDetailID,
                ISNULL(@MatchSource, 'Vector'),
                @MatchRecordID,
                ISNULL(@MatchProbability, 0),
                ISNULL(@MatchedAt, sysdatetimeoffset()),
                ISNULL(@Action, 'Ignore'),
                ISNULL(@ApprovalStatus, 'Pending'),
                @RecordMergeLogID,
                ISNULL(@MergeStatus, 'Pending'),
                ISNULL(@MergedAt, sysdatetimeoffset())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Duplicate Run Detail Matches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: spUpdateDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch]
    @ID uniqueidentifier,
    @DuplicateRunDetailID uniqueidentifier,
    @MatchSource nvarchar(20),
    @MatchRecordID nvarchar(500),
    @MatchProbability numeric(12, 11),
    @MatchedAt datetimeoffset,
    @Action nvarchar(20),
    @ApprovalStatus nvarchar(20),
    @RecordMergeLogID uniqueidentifier,
    @MergeStatus nvarchar(20),
    @MergedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
    SET
        [DuplicateRunDetailID] = @DuplicateRunDetailID,
        [MatchSource] = @MatchSource,
        [MatchRecordID] = @MatchRecordID,
        [MatchProbability] = @MatchProbability,
        [MatchedAt] = @MatchedAt,
        [Action] = @Action,
        [ApprovalStatus] = @ApprovalStatus,
        [RecordMergeLogID] = @RecordMergeLogID,
        [MergeStatus] = @MergeStatus,
        [MergedAt] = @MergedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRunDetailMatch table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDuplicateRunDetailMatch]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDuplicateRunDetailMatch];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDuplicateRunDetailMatch
ON [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Duplicate Run Detail Matches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: spDeleteDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch] TO [cdp_Integration]
    

/* spDelete Permissions for Duplicate Run Detail Matches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch] TO [cdp_Integration]



/* Index for Foreign Keys for DuplicateRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID ON [${flyway:defaultSchema}].[DuplicateRun] ([EntityID]);

-- Index for foreign key StartedByUserID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID ON [${flyway:defaultSchema}].[DuplicateRun] ([StartedByUserID]);

-- Index for foreign key SourceListID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID ON [${flyway:defaultSchema}].[DuplicateRun] ([SourceListID]);

-- Index for foreign key ApprovedByUserID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID ON [${flyway:defaultSchema}].[DuplicateRun] ([ApprovedByUserID]);

/* Base View SQL for Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Duplicate Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DuplicateRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDuplicateRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDuplicateRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDuplicateRuns]
AS
SELECT
    d.*,
    Entity_EntityID.[Name] AS [Entity],
    User_StartedByUserID.[Name] AS [StartedByUser],
    List_SourceListID.[Name] AS [SourceList],
    User_ApprovedByUserID.[Name] AS [ApprovedByUser]
FROM
    [${flyway:defaultSchema}].[DuplicateRun] AS d
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [d].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_StartedByUserID
  ON
    [d].[StartedByUserID] = User_StartedByUserID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[List] AS List_SourceListID
  ON
    [d].[SourceListID] = List_SourceListID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_ApprovedByUserID
  ON
    [d].[ApprovedByUserID] = User_ApprovedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: Permissions for vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: spCreateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRun]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @StartedByUserID uniqueidentifier,
    @SourceListID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @EndedAt datetimeoffset,
    @ApprovalStatus nvarchar(20) = NULL,
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(20) = NULL,
    @ProcessingErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRun]
            (
                [ID],
                [EntityID],
                [StartedByUserID],
                [SourceListID],
                [StartedAt],
                [EndedAt],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @StartedByUserID,
                @SourceListID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @EndedAt,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovalComments,
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                @ProcessingErrorMessage
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRun]
            (
                [EntityID],
                [StartedByUserID],
                [SourceListID],
                [StartedAt],
                [EndedAt],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @StartedByUserID,
                @SourceListID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @EndedAt,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovalComments,
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                @ProcessingErrorMessage
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDuplicateRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: spUpdateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRun]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @StartedByUserID uniqueidentifier,
    @SourceListID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @ApprovalStatus nvarchar(20),
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(20),
    @ProcessingErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRun]
    SET
        [EntityID] = @EntityID,
        [StartedByUserID] = @StartedByUserID,
        [SourceListID] = @SourceListID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovalComments] = @ApprovalComments,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingErrorMessage] = @ProcessingErrorMessage
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDuplicateRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDuplicateRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDuplicateRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDuplicateRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDuplicateRun
ON [${flyway:defaultSchema}].[DuplicateRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DuplicateRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: spDeleteDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DuplicateRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] TO [cdp_Integration]
    

/* spDelete Permissions for Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] TO [cdp_Integration]



/* Index for Foreign Keys for EntityDocumentRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityDocumentID in table EntityDocumentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocumentRun_EntityDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocumentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocumentRun_EntityDocumentID ON [${flyway:defaultSchema}].[EntityDocumentRun] ([EntityDocumentID]);

/* Base View SQL for Entity Document Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: vwEntityDocumentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Entity Document Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityDocumentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityDocumentRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityDocumentRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityDocumentRuns]
AS
SELECT
    e.*,
    EntityDocument_EntityDocumentID.[Name] AS [EntityDocument]
FROM
    [${flyway:defaultSchema}].[EntityDocumentRun] AS e
INNER JOIN
    [${flyway:defaultSchema}].[EntityDocument] AS EntityDocument_EntityDocumentID
  ON
    [e].[EntityDocumentID] = EntityDocument_EntityDocumentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityDocumentRuns] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Entity Document Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: Permissions for vwEntityDocumentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityDocumentRuns] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Entity Document Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: spCreateEntityDocumentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityDocumentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityDocumentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityDocumentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityDocumentRun]
    @ID uniqueidentifier = NULL,
    @EntityDocumentID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(15) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityDocumentRun]
            (
                [ID],
                [EntityDocumentID],
                [StartedAt],
                [EndedAt],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityDocumentID,
                @StartedAt,
                @EndedAt,
                ISNULL(@Status, 'Pending')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityDocumentRun]
            (
                [EntityDocumentID],
                [StartedAt],
                [EndedAt],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityDocumentID,
                @StartedAt,
                @EndedAt,
                ISNULL(@Status, 'Pending')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityDocumentRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityDocumentRun] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Document Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityDocumentRun] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Document Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: spUpdateEntityDocumentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityDocumentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityDocumentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityDocumentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityDocumentRun]
    @ID uniqueidentifier,
    @EntityDocumentID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(15)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityDocumentRun]
    SET
        [EntityDocumentID] = @EntityDocumentID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityDocumentRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityDocumentRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityDocumentRun] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityDocumentRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityDocumentRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityDocumentRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityDocumentRun
ON [${flyway:defaultSchema}].[EntityDocumentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityDocumentRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityDocumentRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Document Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityDocumentRun] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Document Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: spDeleteEntityDocumentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityDocumentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityDocumentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityDocumentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityDocumentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityDocumentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocumentRun] TO [cdp_Integration]
    

/* spDelete Permissions for Entity Document Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocumentRun] TO [cdp_Integration]



/* Index for Foreign Keys for EntityRecordDocument */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityRecordDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRecordDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityID ON [${flyway:defaultSchema}].[EntityRecordDocument] ([EntityID]);

-- Index for foreign key EntityDocumentID in table EntityRecordDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRecordDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityDocumentID ON [${flyway:defaultSchema}].[EntityRecordDocument] ([EntityDocumentID]);

-- Index for foreign key VectorIndexID in table EntityRecordDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRecordDocument_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRecordDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRecordDocument_VectorIndexID ON [${flyway:defaultSchema}].[EntityRecordDocument] ([VectorIndexID]);

/* Base View SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: vwEntityRecordDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Entity Record Documents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityRecordDocument
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityRecordDocuments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityRecordDocuments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityRecordDocuments]
AS
SELECT
    e.*,
    Entity_EntityID.[Name] AS [Entity],
    EntityDocument_EntityDocumentID.[Name] AS [EntityDocument],
    VectorIndex_VectorIndexID.[Name] AS [VectorIndex]
FROM
    [${flyway:defaultSchema}].[EntityRecordDocument] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[EntityDocument] AS EntityDocument_EntityDocumentID
  ON
    [e].[EntityDocumentID] = EntityDocument_EntityDocumentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS VectorIndex_VectorIndexID
  ON
    [e].[VectorIndexID] = VectorIndex_VectorIndexID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRecordDocuments] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: Permissions for vwEntityRecordDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRecordDocuments] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: spCreateEntityRecordDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRecordDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityRecordDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRecordDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRecordDocument]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EntityDocumentID uniqueidentifier,
    @DocumentText nvarchar(MAX),
    @VectorIndexID uniqueidentifier,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityRecordDocument]
            (
                [ID],
                [EntityID],
                [RecordID],
                [EntityDocumentID],
                [DocumentText],
                [VectorIndexID],
                [VectorID],
                [VectorJSON],
                [EntityRecordUpdatedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @RecordID,
                @EntityDocumentID,
                @DocumentText,
                @VectorIndexID,
                @VectorID,
                @VectorJSON,
                @EntityRecordUpdatedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityRecordDocument]
            (
                [EntityID],
                [RecordID],
                [EntityDocumentID],
                [DocumentText],
                [VectorIndexID],
                [VectorID],
                [VectorJSON],
                [EntityRecordUpdatedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @RecordID,
                @EntityDocumentID,
                @DocumentText,
                @VectorIndexID,
                @VectorID,
                @VectorJSON,
                @EntityRecordUpdatedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRecordDocuments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Entity Record Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: spUpdateEntityRecordDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRecordDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityRecordDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRecordDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRecordDocument]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EntityDocumentID uniqueidentifier,
    @DocumentText nvarchar(MAX),
    @VectorIndexID uniqueidentifier,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRecordDocument]
    SET
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [EntityDocumentID] = @EntityDocumentID,
        [DocumentText] = @DocumentText,
        [VectorIndexID] = @VectorIndexID,
        [VectorID] = @VectorID,
        [VectorJSON] = @VectorJSON,
        [EntityRecordUpdatedAt] = @EntityRecordUpdatedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityRecordDocuments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityRecordDocuments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityRecordDocument table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityRecordDocument]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityRecordDocument];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityRecordDocument
ON [${flyway:defaultSchema}].[EntityRecordDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRecordDocument]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityRecordDocument] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Record Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: spDeleteEntityRecordDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRecordDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityRecordDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRecordDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRecordDocument]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityRecordDocument]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRecordDocument] TO [cdp_Integration]
    

/* spDelete Permissions for Entity Record Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRecordDocument] TO [cdp_Integration]



/* Index for Foreign Keys for AIPromptRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PromptID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_PromptID ON [${flyway:defaultSchema}].[AIPromptRun] ([PromptID]);

-- Index for foreign key ModelID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ModelID ON [${flyway:defaultSchema}].[AIPromptRun] ([ModelID]);

-- Index for foreign key VendorID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_VendorID ON [${flyway:defaultSchema}].[AIPromptRun] ([VendorID]);

-- Index for foreign key AgentID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_AgentID ON [${flyway:defaultSchema}].[AIPromptRun] ([AgentID]);

-- Index for foreign key ConfigurationID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ConfigurationID ON [${flyway:defaultSchema}].[AIPromptRun] ([ConfigurationID]);

-- Index for foreign key ParentID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ParentID ON [${flyway:defaultSchema}].[AIPromptRun] ([ParentID]);

-- Index for foreign key AgentRunID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_AgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_AgentRunID ON [${flyway:defaultSchema}].[AIPromptRun] ([AgentRunID]);

-- Index for foreign key OriginalModelID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_OriginalModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_OriginalModelID ON [${flyway:defaultSchema}].[AIPromptRun] ([OriginalModelID]);

-- Index for foreign key RerunFromPromptRunID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_RerunFromPromptRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_RerunFromPromptRunID ON [${flyway:defaultSchema}].[AIPromptRun] ([RerunFromPromptRunID]);

-- Index for foreign key JudgeID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_JudgeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_JudgeID ON [${flyway:defaultSchema}].[AIPromptRun] ([JudgeID]);

-- Index for foreign key ChildPromptID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ChildPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ChildPromptID ON [${flyway:defaultSchema}].[AIPromptRun] ([ChildPromptID]);

-- Index for foreign key TestRunID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_TestRunID ON [${flyway:defaultSchema}].[AIPromptRun] ([TestRunID]);

/* Root ID Function SQL for MJ: AI Prompt Runs.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: fnAIPromptRunParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIPromptRun].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIPromptRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIPromptRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* Root ID Function SQL for MJ: AI Prompt Runs.RerunFromPromptRunID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: fnAIPromptRunRerunFromPromptRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIPromptRun].[RerunFromPromptRunID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [RerunFromPromptRunID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIPromptRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until RerunFromPromptRunID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[RerunFromPromptRunID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIPromptRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[RerunFromPromptRunID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [RerunFromPromptRunID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* Base View SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIPromptRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIPromptRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptRuns]
AS
SELECT
    a.*,
    AIPrompt_PromptID.[Name] AS [Prompt],
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIAgent_AgentID.[Name] AS [Agent],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration],
    AIPromptRun_ParentID.[RunName] AS [Parent],
    AIAgentRun_AgentRunID.[RunName] AS [AgentRun],
    AIModel_OriginalModelID.[Name] AS [OriginalModel],
    AIPromptRun_RerunFromPromptRunID.[RunName] AS [RerunFromPromptRun],
    AIPrompt_JudgeID.[Name] AS [Judge],
    AIPrompt_ChildPromptID.[Name] AS [ChildPrompt],
    root_ParentID.RootID AS [RootParentID],
    root_RerunFromPromptRunID.RootID AS [RootRerunFromPromptRunID]
FROM
    [${flyway:defaultSchema}].[AIPromptRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS AIPromptRun_ParentID
  ON
    [a].[ParentID] = AIPromptRun_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS AIAgentRun_AgentRunID
  ON
    [a].[AgentRunID] = AIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_OriginalModelID
  ON
    [a].[OriginalModelID] = AIModel_OriginalModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS AIPromptRun_RerunFromPromptRunID
  ON
    [a].[RerunFromPromptRunID] = AIPromptRun_RerunFromPromptRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_JudgeID
  ON
    [a].[JudgeID] = AIPrompt_JudgeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ChildPromptID
  ON
    [a].[ChildPromptID] = AIPrompt_ChildPromptID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID]([a].[ID], [a].[RerunFromPromptRunID]) AS root_RerunFromPromptRunID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Permissions for vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun]
    @ID uniqueidentifier = NULL,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetimeoffset = NULL,
    @CompletedAt datetimeoffset,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit = NULL,
    @ErrorMessage nvarchar(MAX),
    @ParentID uniqueidentifier,
    @RunType nvarchar(20) = NULL,
    @ExecutionOrder int,
    @AgentRunID uniqueidentifier,
    @Cost decimal(19, 8),
    @CostCurrency nvarchar(10),
    @TokensUsedRollup int,
    @TokensPromptRollup int,
    @TokensCompletionRollup int,
    @Temperature decimal(3, 2),
    @TopP decimal(3, 2),
    @TopK int,
    @MinP decimal(3, 2),
    @FrequencyPenalty decimal(3, 2),
    @PresencePenalty decimal(3, 2),
    @Seed int,
    @StopSequences nvarchar(MAX),
    @ResponseFormat nvarchar(50),
    @LogProbs bit,
    @TopLogProbs int,
    @DescendantCost decimal(18, 6),
    @ValidationAttemptCount int,
    @SuccessfulValidationCount int,
    @FinalValidationPassed bit,
    @ValidationBehavior nvarchar(50),
    @RetryStrategy nvarchar(50),
    @MaxRetriesConfigured int,
    @FinalValidationError nvarchar(500),
    @ValidationErrorCount int,
    @CommonValidationError nvarchar(255),
    @FirstAttemptAt datetimeoffset,
    @LastAttemptAt datetimeoffset,
    @TotalRetryDurationMS int,
    @ValidationAttempts nvarchar(MAX),
    @ValidationSummary nvarchar(MAX),
    @FailoverAttempts int,
    @FailoverErrors nvarchar(MAX),
    @FailoverDurations nvarchar(MAX),
    @OriginalModelID uniqueidentifier,
    @OriginalRequestStartTime datetimeoffset,
    @TotalFailoverDuration int,
    @RerunFromPromptRunID uniqueidentifier,
    @ModelSelection nvarchar(MAX),
    @Status nvarchar(50) = NULL,
    @Cancelled bit = NULL,
    @CancellationReason nvarchar(MAX),
    @ModelPowerRank int,
    @SelectionStrategy nvarchar(50),
    @CacheHit bit = NULL,
    @CacheKey nvarchar(500),
    @JudgeID uniqueidentifier,
    @JudgeScore float(53),
    @WasSelectedResult bit = NULL,
    @StreamingEnabled bit = NULL,
    @FirstTokenTime int,
    @ErrorDetails nvarchar(MAX),
    @ChildPromptID uniqueidentifier,
    @QueueTime int,
    @PromptTime int,
    @CompletionTime int,
    @ModelSpecificResponseDetails nvarchar(MAX),
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @TestRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRun]
            (
                [ID],
                [PromptID],
                [ModelID],
                [VendorID],
                [AgentID],
                [ConfigurationID],
                [RunAt],
                [CompletedAt],
                [ExecutionTimeMS],
                [Messages],
                [Result],
                [TokensUsed],
                [TokensPrompt],
                [TokensCompletion],
                [TotalCost],
                [Success],
                [ErrorMessage],
                [ParentID],
                [RunType],
                [ExecutionOrder],
                [AgentRunID],
                [Cost],
                [CostCurrency],
                [TokensUsedRollup],
                [TokensPromptRollup],
                [TokensCompletionRollup],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [ResponseFormat],
                [LogProbs],
                [TopLogProbs],
                [DescendantCost],
                [ValidationAttemptCount],
                [SuccessfulValidationCount],
                [FinalValidationPassed],
                [ValidationBehavior],
                [RetryStrategy],
                [MaxRetriesConfigured],
                [FinalValidationError],
                [ValidationErrorCount],
                [CommonValidationError],
                [FirstAttemptAt],
                [LastAttemptAt],
                [TotalRetryDurationMS],
                [ValidationAttempts],
                [ValidationSummary],
                [FailoverAttempts],
                [FailoverErrors],
                [FailoverDurations],
                [OriginalModelID],
                [OriginalRequestStartTime],
                [TotalFailoverDuration],
                [RerunFromPromptRunID],
                [ModelSelection],
                [Status],
                [Cancelled],
                [CancellationReason],
                [ModelPowerRank],
                [SelectionStrategy],
                [CacheHit],
                [CacheKey],
                [JudgeID],
                [JudgeScore],
                [WasSelectedResult],
                [StreamingEnabled],
                [FirstTokenTime],
                [ErrorDetails],
                [ChildPromptID],
                [QueueTime],
                [PromptTime],
                [CompletionTime],
                [ModelSpecificResponseDetails],
                [EffortLevel],
                [RunName],
                [Comments],
                [TestRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PromptID,
                @ModelID,
                @VendorID,
                @AgentID,
                @ConfigurationID,
                ISNULL(@RunAt, sysdatetimeoffset()),
                @CompletedAt,
                @ExecutionTimeMS,
                @Messages,
                @Result,
                @TokensUsed,
                @TokensPrompt,
                @TokensCompletion,
                @TotalCost,
                ISNULL(@Success, 0),
                @ErrorMessage,
                @ParentID,
                ISNULL(@RunType, 'Single'),
                @ExecutionOrder,
                @AgentRunID,
                @Cost,
                @CostCurrency,
                @TokensUsedRollup,
                @TokensPromptRollup,
                @TokensCompletionRollup,
                @Temperature,
                @TopP,
                @TopK,
                @MinP,
                @FrequencyPenalty,
                @PresencePenalty,
                @Seed,
                @StopSequences,
                @ResponseFormat,
                @LogProbs,
                @TopLogProbs,
                @DescendantCost,
                @ValidationAttemptCount,
                @SuccessfulValidationCount,
                @FinalValidationPassed,
                @ValidationBehavior,
                @RetryStrategy,
                @MaxRetriesConfigured,
                @FinalValidationError,
                @ValidationErrorCount,
                @CommonValidationError,
                @FirstAttemptAt,
                @LastAttemptAt,
                @TotalRetryDurationMS,
                @ValidationAttempts,
                @ValidationSummary,
                @FailoverAttempts,
                @FailoverErrors,
                @FailoverDurations,
                @OriginalModelID,
                @OriginalRequestStartTime,
                @TotalFailoverDuration,
                @RerunFromPromptRunID,
                @ModelSelection,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                @CancellationReason,
                @ModelPowerRank,
                @SelectionStrategy,
                ISNULL(@CacheHit, 0),
                @CacheKey,
                @JudgeID,
                @JudgeScore,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                @FirstTokenTime,
                @ErrorDetails,
                @ChildPromptID,
                @QueueTime,
                @PromptTime,
                @CompletionTime,
                @ModelSpecificResponseDetails,
                @EffortLevel,
                @RunName,
                @Comments,
                @TestRunID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRun]
            (
                [PromptID],
                [ModelID],
                [VendorID],
                [AgentID],
                [ConfigurationID],
                [RunAt],
                [CompletedAt],
                [ExecutionTimeMS],
                [Messages],
                [Result],
                [TokensUsed],
                [TokensPrompt],
                [TokensCompletion],
                [TotalCost],
                [Success],
                [ErrorMessage],
                [ParentID],
                [RunType],
                [ExecutionOrder],
                [AgentRunID],
                [Cost],
                [CostCurrency],
                [TokensUsedRollup],
                [TokensPromptRollup],
                [TokensCompletionRollup],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [ResponseFormat],
                [LogProbs],
                [TopLogProbs],
                [DescendantCost],
                [ValidationAttemptCount],
                [SuccessfulValidationCount],
                [FinalValidationPassed],
                [ValidationBehavior],
                [RetryStrategy],
                [MaxRetriesConfigured],
                [FinalValidationError],
                [ValidationErrorCount],
                [CommonValidationError],
                [FirstAttemptAt],
                [LastAttemptAt],
                [TotalRetryDurationMS],
                [ValidationAttempts],
                [ValidationSummary],
                [FailoverAttempts],
                [FailoverErrors],
                [FailoverDurations],
                [OriginalModelID],
                [OriginalRequestStartTime],
                [TotalFailoverDuration],
                [RerunFromPromptRunID],
                [ModelSelection],
                [Status],
                [Cancelled],
                [CancellationReason],
                [ModelPowerRank],
                [SelectionStrategy],
                [CacheHit],
                [CacheKey],
                [JudgeID],
                [JudgeScore],
                [WasSelectedResult],
                [StreamingEnabled],
                [FirstTokenTime],
                [ErrorDetails],
                [ChildPromptID],
                [QueueTime],
                [PromptTime],
                [CompletionTime],
                [ModelSpecificResponseDetails],
                [EffortLevel],
                [RunName],
                [Comments],
                [TestRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PromptID,
                @ModelID,
                @VendorID,
                @AgentID,
                @ConfigurationID,
                ISNULL(@RunAt, sysdatetimeoffset()),
                @CompletedAt,
                @ExecutionTimeMS,
                @Messages,
                @Result,
                @TokensUsed,
                @TokensPrompt,
                @TokensCompletion,
                @TotalCost,
                ISNULL(@Success, 0),
                @ErrorMessage,
                @ParentID,
                ISNULL(@RunType, 'Single'),
                @ExecutionOrder,
                @AgentRunID,
                @Cost,
                @CostCurrency,
                @TokensUsedRollup,
                @TokensPromptRollup,
                @TokensCompletionRollup,
                @Temperature,
                @TopP,
                @TopK,
                @MinP,
                @FrequencyPenalty,
                @PresencePenalty,
                @Seed,
                @StopSequences,
                @ResponseFormat,
                @LogProbs,
                @TopLogProbs,
                @DescendantCost,
                @ValidationAttemptCount,
                @SuccessfulValidationCount,
                @FinalValidationPassed,
                @ValidationBehavior,
                @RetryStrategy,
                @MaxRetriesConfigured,
                @FinalValidationError,
                @ValidationErrorCount,
                @CommonValidationError,
                @FirstAttemptAt,
                @LastAttemptAt,
                @TotalRetryDurationMS,
                @ValidationAttempts,
                @ValidationSummary,
                @FailoverAttempts,
                @FailoverErrors,
                @FailoverDurations,
                @OriginalModelID,
                @OriginalRequestStartTime,
                @TotalFailoverDuration,
                @RerunFromPromptRunID,
                @ModelSelection,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                @CancellationReason,
                @ModelPowerRank,
                @SelectionStrategy,
                ISNULL(@CacheHit, 0),
                @CacheKey,
                @JudgeID,
                @JudgeScore,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                @FirstTokenTime,
                @ErrorDetails,
                @ChildPromptID,
                @QueueTime,
                @PromptTime,
                @CompletionTime,
                @ModelSpecificResponseDetails,
                @EffortLevel,
                @RunName,
                @Comments,
                @TestRunID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRun]
    @ID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ParentID uniqueidentifier,
    @RunType nvarchar(20),
    @ExecutionOrder int,
    @AgentRunID uniqueidentifier,
    @Cost decimal(19, 8),
    @CostCurrency nvarchar(10),
    @TokensUsedRollup int,
    @TokensPromptRollup int,
    @TokensCompletionRollup int,
    @Temperature decimal(3, 2),
    @TopP decimal(3, 2),
    @TopK int,
    @MinP decimal(3, 2),
    @FrequencyPenalty decimal(3, 2),
    @PresencePenalty decimal(3, 2),
    @Seed int,
    @StopSequences nvarchar(MAX),
    @ResponseFormat nvarchar(50),
    @LogProbs bit,
    @TopLogProbs int,
    @DescendantCost decimal(18, 6),
    @ValidationAttemptCount int,
    @SuccessfulValidationCount int,
    @FinalValidationPassed bit,
    @ValidationBehavior nvarchar(50),
    @RetryStrategy nvarchar(50),
    @MaxRetriesConfigured int,
    @FinalValidationError nvarchar(500),
    @ValidationErrorCount int,
    @CommonValidationError nvarchar(255),
    @FirstAttemptAt datetimeoffset,
    @LastAttemptAt datetimeoffset,
    @TotalRetryDurationMS int,
    @ValidationAttempts nvarchar(MAX),
    @ValidationSummary nvarchar(MAX),
    @FailoverAttempts int,
    @FailoverErrors nvarchar(MAX),
    @FailoverDurations nvarchar(MAX),
    @OriginalModelID uniqueidentifier,
    @OriginalRequestStartTime datetimeoffset,
    @TotalFailoverDuration int,
    @RerunFromPromptRunID uniqueidentifier,
    @ModelSelection nvarchar(MAX),
    @Status nvarchar(50),
    @Cancelled bit,
    @CancellationReason nvarchar(MAX),
    @ModelPowerRank int,
    @SelectionStrategy nvarchar(50),
    @CacheHit bit,
    @CacheKey nvarchar(500),
    @JudgeID uniqueidentifier,
    @JudgeScore float(53),
    @WasSelectedResult bit,
    @StreamingEnabled bit,
    @FirstTokenTime int,
    @ErrorDetails nvarchar(MAX),
    @ChildPromptID uniqueidentifier,
    @QueueTime int,
    @PromptTime int,
    @CompletionTime int,
    @ModelSpecificResponseDetails nvarchar(MAX),
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @TestRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        [PromptID] = @PromptID,
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [AgentID] = @AgentID,
        [ConfigurationID] = @ConfigurationID,
        [RunAt] = @RunAt,
        [CompletedAt] = @CompletedAt,
        [ExecutionTimeMS] = @ExecutionTimeMS,
        [Messages] = @Messages,
        [Result] = @Result,
        [TokensUsed] = @TokensUsed,
        [TokensPrompt] = @TokensPrompt,
        [TokensCompletion] = @TokensCompletion,
        [TotalCost] = @TotalCost,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [ParentID] = @ParentID,
        [RunType] = @RunType,
        [ExecutionOrder] = @ExecutionOrder,
        [AgentRunID] = @AgentRunID,
        [Cost] = @Cost,
        [CostCurrency] = @CostCurrency,
        [TokensUsedRollup] = @TokensUsedRollup,
        [TokensPromptRollup] = @TokensPromptRollup,
        [TokensCompletionRollup] = @TokensCompletionRollup,
        [Temperature] = @Temperature,
        [TopP] = @TopP,
        [TopK] = @TopK,
        [MinP] = @MinP,
        [FrequencyPenalty] = @FrequencyPenalty,
        [PresencePenalty] = @PresencePenalty,
        [Seed] = @Seed,
        [StopSequences] = @StopSequences,
        [ResponseFormat] = @ResponseFormat,
        [LogProbs] = @LogProbs,
        [TopLogProbs] = @TopLogProbs,
        [DescendantCost] = @DescendantCost,
        [ValidationAttemptCount] = @ValidationAttemptCount,
        [SuccessfulValidationCount] = @SuccessfulValidationCount,
        [FinalValidationPassed] = @FinalValidationPassed,
        [ValidationBehavior] = @ValidationBehavior,
        [RetryStrategy] = @RetryStrategy,
        [MaxRetriesConfigured] = @MaxRetriesConfigured,
        [FinalValidationError] = @FinalValidationError,
        [ValidationErrorCount] = @ValidationErrorCount,
        [CommonValidationError] = @CommonValidationError,
        [FirstAttemptAt] = @FirstAttemptAt,
        [LastAttemptAt] = @LastAttemptAt,
        [TotalRetryDurationMS] = @TotalRetryDurationMS,
        [ValidationAttempts] = @ValidationAttempts,
        [ValidationSummary] = @ValidationSummary,
        [FailoverAttempts] = @FailoverAttempts,
        [FailoverErrors] = @FailoverErrors,
        [FailoverDurations] = @FailoverDurations,
        [OriginalModelID] = @OriginalModelID,
        [OriginalRequestStartTime] = @OriginalRequestStartTime,
        [TotalFailoverDuration] = @TotalFailoverDuration,
        [RerunFromPromptRunID] = @RerunFromPromptRunID,
        [ModelSelection] = @ModelSelection,
        [Status] = @Status,
        [Cancelled] = @Cancelled,
        [CancellationReason] = @CancellationReason,
        [ModelPowerRank] = @ModelPowerRank,
        [SelectionStrategy] = @SelectionStrategy,
        [CacheHit] = @CacheHit,
        [CacheKey] = @CacheKey,
        [JudgeID] = @JudgeID,
        [JudgeScore] = @JudgeScore,
        [WasSelectedResult] = @WasSelectedResult,
        [StreamingEnabled] = @StreamingEnabled,
        [FirstTokenTime] = @FirstTokenTime,
        [ErrorDetails] = @ErrorDetails,
        [ChildPromptID] = @ChildPromptID,
        [QueueTime] = @QueueTime,
        [PromptTime] = @PromptTime,
        [CompletionTime] = @CompletionTime,
        [ModelSpecificResponseDetails] = @ModelSpecificResponseDetails,
        [EffortLevel] = @EffortLevel,
        [RunName] = @RunName,
        [Comments] = @Comments,
        [TestRunID] = @TestRunID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIPromptRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPromptRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPromptRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPromptRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptRun
ON [${flyway:defaultSchema}].[AIPromptRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for TestRunFeedback */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TestRunID in table TestRunFeedback
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRunFeedback_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRunFeedback]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRunFeedback_TestRunID ON [${flyway:defaultSchema}].[TestRunFeedback] ([TestRunID]);

-- Index for foreign key ReviewerUserID in table TestRunFeedback
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRunFeedback_ReviewerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRunFeedback]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRunFeedback_ReviewerUserID ON [${flyway:defaultSchema}].[TestRunFeedback] ([ReviewerUserID]);

/* Index for Foreign Keys for TestRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TestID in table TestRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRun_TestID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRun_TestID ON [${flyway:defaultSchema}].[TestRun] ([TestID]);

-- Index for foreign key TestSuiteRunID in table TestRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRun_TestSuiteRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRun_TestSuiteRunID ON [${flyway:defaultSchema}].[TestRun] ([TestSuiteRunID]);

-- Index for foreign key RunByUserID in table TestRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRun_RunByUserID ON [${flyway:defaultSchema}].[TestRun] ([RunByUserID]);

/* Index for Foreign Keys for TestSuiteRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SuiteID in table TestSuiteRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestSuiteRun_SuiteID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestSuiteRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestSuiteRun_SuiteID ON [${flyway:defaultSchema}].[TestSuiteRun] ([SuiteID]);

-- Index for foreign key RunByUserID in table TestSuiteRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestSuiteRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestSuiteRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestSuiteRun_RunByUserID ON [${flyway:defaultSchema}].[TestSuiteRun] ([RunByUserID]);

/* Base View SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: vwTestRunFeedbacks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Run Feedbacks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestRunFeedback
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestRunFeedbacks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestRunFeedbacks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestRunFeedbacks]
AS
SELECT
    t.*,
    User_ReviewerUserID.[Name] AS [ReviewerUser]
FROM
    [${flyway:defaultSchema}].[TestRunFeedback] AS t
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_ReviewerUserID
  ON
    [t].[ReviewerUserID] = User_ReviewerUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRunFeedbacks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: Permissions for vwTestRunFeedbacks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRunFeedbacks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: spCreateTestRunFeedback
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRunFeedback
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestRunFeedback]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunFeedback];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunFeedback]
    @ID uniqueidentifier = NULL,
    @TestRunID uniqueidentifier,
    @ReviewerUserID uniqueidentifier,
    @Rating int,
    @IsCorrect bit,
    @CorrectionSummary nvarchar(MAX),
    @Comments nvarchar(MAX),
    @ReviewedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestRunFeedback]
            (
                [ID],
                [TestRunID],
                [ReviewerUserID],
                [Rating],
                [IsCorrect],
                [CorrectionSummary],
                [Comments],
                [ReviewedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TestRunID,
                @ReviewerUserID,
                @Rating,
                @IsCorrect,
                @CorrectionSummary,
                @Comments,
                ISNULL(@ReviewedAt, sysdatetimeoffset())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestRunFeedback]
            (
                [TestRunID],
                [ReviewerUserID],
                [Rating],
                [IsCorrect],
                [CorrectionSummary],
                [Comments],
                [ReviewedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TestRunID,
                @ReviewerUserID,
                @Rating,
                @IsCorrect,
                @CorrectionSummary,
                @Comments,
                ISNULL(@ReviewedAt, sysdatetimeoffset())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestRunFeedbacks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Run Feedbacks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: spUpdateTestRunFeedback
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRunFeedback
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestRunFeedback]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunFeedback];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunFeedback]
    @ID uniqueidentifier,
    @TestRunID uniqueidentifier,
    @ReviewerUserID uniqueidentifier,
    @Rating int,
    @IsCorrect bit,
    @CorrectionSummary nvarchar(MAX),
    @Comments nvarchar(MAX),
    @ReviewedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunFeedback]
    SET
        [TestRunID] = @TestRunID,
        [ReviewerUserID] = @ReviewerUserID,
        [Rating] = @Rating,
        [IsCorrect] = @IsCorrect,
        [CorrectionSummary] = @CorrectionSummary,
        [Comments] = @Comments,
        [ReviewedAt] = @ReviewedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestRunFeedbacks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestRunFeedbacks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRunFeedback table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestRunFeedback]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestRunFeedback];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestRunFeedback
ON [${flyway:defaultSchema}].[TestRunFeedback]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunFeedback]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestRunFeedback] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Run Feedbacks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: spDeleteTestRunFeedback
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRunFeedback
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestRunFeedback]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRunFeedback];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRunFeedback]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestRunFeedback]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRunFeedback] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Run Feedbacks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRunFeedback] TO [cdp_Integration]



/* Base View SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: vwTestRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestRuns]
AS
SELECT
    t.*,
    Test_TestID.[Name] AS [Test],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[TestRun] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Test] AS Test_TestID
  ON
    [t].[TestID] = Test_TestID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_RunByUserID
  ON
    [t].[RunByUserID] = User_RunByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: Permissions for vwTestRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spCreateTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestRun]
    @ID uniqueidentifier = NULL,
    @TestID uniqueidentifier,
    @TestSuiteRunID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Sequence int,
    @TargetType nvarchar(100),
    @TargetLogID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @DurationSeconds decimal(10, 3),
    @InputData nvarchar(MAX),
    @ExpectedOutputData nvarchar(MAX),
    @ActualOutputData nvarchar(MAX),
    @PassedChecks int,
    @FailedChecks int,
    @TotalChecks int,
    @Score decimal(5, 4),
    @CostUSD decimal(10, 6),
    @ErrorMessage nvarchar(MAX),
    @ResultDetails nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestRun]
            (
                [ID],
                [TestID],
                [TestSuiteRunID],
                [RunByUserID],
                [Sequence],
                [TargetType],
                [TargetLogID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationSeconds],
                [InputData],
                [ExpectedOutputData],
                [ActualOutputData],
                [PassedChecks],
                [FailedChecks],
                [TotalChecks],
                [Score],
                [CostUSD],
                [ErrorMessage],
                [ResultDetails]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TestID,
                @TestSuiteRunID,
                @RunByUserID,
                @Sequence,
                @TargetType,
                @TargetLogID,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @DurationSeconds,
                @InputData,
                @ExpectedOutputData,
                @ActualOutputData,
                @PassedChecks,
                @FailedChecks,
                @TotalChecks,
                @Score,
                @CostUSD,
                @ErrorMessage,
                @ResultDetails
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestRun]
            (
                [TestID],
                [TestSuiteRunID],
                [RunByUserID],
                [Sequence],
                [TargetType],
                [TargetLogID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationSeconds],
                [InputData],
                [ExpectedOutputData],
                [ActualOutputData],
                [PassedChecks],
                [FailedChecks],
                [TotalChecks],
                [Score],
                [CostUSD],
                [ErrorMessage],
                [ResultDetails]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TestID,
                @TestSuiteRunID,
                @RunByUserID,
                @Sequence,
                @TargetType,
                @TargetLogID,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @DurationSeconds,
                @InputData,
                @ExpectedOutputData,
                @ActualOutputData,
                @PassedChecks,
                @FailedChecks,
                @TotalChecks,
                @Score,
                @CostUSD,
                @ErrorMessage,
                @ResultDetails
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spUpdateTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRun]
    @ID uniqueidentifier,
    @TestID uniqueidentifier,
    @TestSuiteRunID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Sequence int,
    @TargetType nvarchar(100),
    @TargetLogID uniqueidentifier,
    @Status nvarchar(20),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @DurationSeconds decimal(10, 3),
    @InputData nvarchar(MAX),
    @ExpectedOutputData nvarchar(MAX),
    @ActualOutputData nvarchar(MAX),
    @PassedChecks int,
    @FailedChecks int,
    @TotalChecks int,
    @Score decimal(5, 4),
    @CostUSD decimal(10, 6),
    @ErrorMessage nvarchar(MAX),
    @ResultDetails nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRun]
    SET
        [TestID] = @TestID,
        [TestSuiteRunID] = @TestSuiteRunID,
        [RunByUserID] = @RunByUserID,
        [Sequence] = @Sequence,
        [TargetType] = @TargetType,
        [TargetLogID] = @TargetLogID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [DurationSeconds] = @DurationSeconds,
        [InputData] = @InputData,
        [ExpectedOutputData] = @ExpectedOutputData,
        [ActualOutputData] = @ActualOutputData,
        [PassedChecks] = @PassedChecks,
        [FailedChecks] = @FailedChecks,
        [TotalChecks] = @TotalChecks,
        [Score] = @Score,
        [CostUSD] = @CostUSD,
        [ErrorMessage] = @ErrorMessage,
        [ResultDetails] = @ResultDetails
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestRun
ON [${flyway:defaultSchema}].[TestRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spDeleteTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRun] TO [cdp_Integration]



/* Base View SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: vwTestSuiteRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Suite Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestSuiteRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestSuiteRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestSuiteRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestSuiteRuns]
AS
SELECT
    t.*,
    TestSuite_SuiteID.[Name] AS [Suite],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[TestSuiteRun] AS t
INNER JOIN
    [${flyway:defaultSchema}].[TestSuite] AS TestSuite_SuiteID
  ON
    [t].[SuiteID] = TestSuite_SuiteID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_RunByUserID
  ON
    [t].[RunByUserID] = User_RunByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestSuiteRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: Permissions for vwTestSuiteRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestSuiteRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: spCreateTestSuiteRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestSuiteRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestSuiteRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestSuiteRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestSuiteRun]
    @ID uniqueidentifier = NULL,
    @SuiteID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Environment nvarchar(50),
    @TriggerType nvarchar(50),
    @GitCommit nvarchar(100),
    @AgentVersion nvarchar(100),
    @Status nvarchar(20) = NULL,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @TotalTests int,
    @PassedTests int,
    @FailedTests int,
    @SkippedTests int,
    @ErrorTests int,
    @TotalDurationSeconds decimal(10, 3),
    @TotalCostUSD decimal(10, 6),
    @Configuration nvarchar(MAX),
    @ResultSummary nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestSuiteRun]
            (
                [ID],
                [SuiteID],
                [RunByUserID],
                [Environment],
                [TriggerType],
                [GitCommit],
                [AgentVersion],
                [Status],
                [StartedAt],
                [CompletedAt],
                [TotalTests],
                [PassedTests],
                [FailedTests],
                [SkippedTests],
                [ErrorTests],
                [TotalDurationSeconds],
                [TotalCostUSD],
                [Configuration],
                [ResultSummary],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SuiteID,
                @RunByUserID,
                @Environment,
                @TriggerType,
                @GitCommit,
                @AgentVersion,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @TotalTests,
                @PassedTests,
                @FailedTests,
                @SkippedTests,
                @ErrorTests,
                @TotalDurationSeconds,
                @TotalCostUSD,
                @Configuration,
                @ResultSummary,
                @ErrorMessage
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestSuiteRun]
            (
                [SuiteID],
                [RunByUserID],
                [Environment],
                [TriggerType],
                [GitCommit],
                [AgentVersion],
                [Status],
                [StartedAt],
                [CompletedAt],
                [TotalTests],
                [PassedTests],
                [FailedTests],
                [SkippedTests],
                [ErrorTests],
                [TotalDurationSeconds],
                [TotalCostUSD],
                [Configuration],
                [ResultSummary],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SuiteID,
                @RunByUserID,
                @Environment,
                @TriggerType,
                @GitCommit,
                @AgentVersion,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @TotalTests,
                @PassedTests,
                @FailedTests,
                @SkippedTests,
                @ErrorTests,
                @TotalDurationSeconds,
                @TotalCostUSD,
                @Configuration,
                @ResultSummary,
                @ErrorMessage
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestSuiteRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Suite Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: spUpdateTestSuiteRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestSuiteRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestSuiteRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestSuiteRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestSuiteRun]
    @ID uniqueidentifier,
    @SuiteID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Environment nvarchar(50),
    @TriggerType nvarchar(50),
    @GitCommit nvarchar(100),
    @AgentVersion nvarchar(100),
    @Status nvarchar(20),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @TotalTests int,
    @PassedTests int,
    @FailedTests int,
    @SkippedTests int,
    @ErrorTests int,
    @TotalDurationSeconds decimal(10, 3),
    @TotalCostUSD decimal(10, 6),
    @Configuration nvarchar(MAX),
    @ResultSummary nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestSuiteRun]
    SET
        [SuiteID] = @SuiteID,
        [RunByUserID] = @RunByUserID,
        [Environment] = @Environment,
        [TriggerType] = @TriggerType,
        [GitCommit] = @GitCommit,
        [AgentVersion] = @AgentVersion,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [TotalTests] = @TotalTests,
        [PassedTests] = @PassedTests,
        [FailedTests] = @FailedTests,
        [SkippedTests] = @SkippedTests,
        [ErrorTests] = @ErrorTests,
        [TotalDurationSeconds] = @TotalDurationSeconds,
        [TotalCostUSD] = @TotalCostUSD,
        [Configuration] = @Configuration,
        [ResultSummary] = @ResultSummary,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestSuiteRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestSuiteRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestSuiteRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestSuiteRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestSuiteRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestSuiteRun
ON [${flyway:defaultSchema}].[TestSuiteRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestSuiteRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestSuiteRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Suite Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: spDeleteTestSuiteRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestSuiteRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestSuiteRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestSuiteRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestSuiteRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestSuiteRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestSuiteRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Suite Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestSuiteRun] TO [cdp_Integration]



/* Index for Foreign Keys for QueueTask */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueueID in table QueueTask
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueueTask_QueueID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueueTask]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueueTask_QueueID ON [${flyway:defaultSchema}].[QueueTask] ([QueueID]);

/* Index for Foreign Keys for Queue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueueTypeID in table Queue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Queue_QueueTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Queue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Queue_QueueTypeID ON [${flyway:defaultSchema}].[Queue] ([QueueTypeID]);

/* Base View SQL for Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: vwQueueTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Queue Tasks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueueTask
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueueTasks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueueTasks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueueTasks]
AS
SELECT
    q.*,
    Queue_QueueID.[Name] AS [Queue]
FROM
    [${flyway:defaultSchema}].[QueueTask] AS q
INNER JOIN
    [${flyway:defaultSchema}].[Queue] AS Queue_QueueID
  ON
    [q].[QueueID] = Queue_QueueID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueueTasks] TO [cdp_UI]
    

/* Base View Permissions SQL for Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: Permissions for vwQueueTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueueTasks] TO [cdp_UI]

/* spCreate SQL for Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: spCreateQueueTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueueTask
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQueueTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQueueTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueueTask]
    @ID uniqueidentifier = NULL,
    @QueueID uniqueidentifier,
    @Status nchar(10) = NULL,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Data nvarchar(MAX),
    @Options nvarchar(MAX),
    @Output nvarchar(MAX),
    @ErrorMessage nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueueTask]
            (
                [ID],
                [QueueID],
                [Status],
                [StartedAt],
                [EndedAt],
                [Data],
                [Options],
                [Output],
                [ErrorMessage],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QueueID,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @EndedAt,
                @Data,
                @Options,
                @Output,
                @ErrorMessage,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueueTask]
            (
                [QueueID],
                [Status],
                [StartedAt],
                [EndedAt],
                [Data],
                [Options],
                [Output],
                [ErrorMessage],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QueueID,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @EndedAt,
                @Data,
                @Options,
                @Output,
                @ErrorMessage,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueueTasks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueueTask] TO [cdp_UI]
    

/* spCreate Permissions for Queue Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueueTask] TO [cdp_UI]



/* spUpdate SQL for Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: spUpdateQueueTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueueTask
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQueueTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQueueTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueueTask]
    @ID uniqueidentifier,
    @QueueID uniqueidentifier,
    @Status nchar(10),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Data nvarchar(MAX),
    @Options nvarchar(MAX),
    @Output nvarchar(MAX),
    @ErrorMessage nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueueTask]
    SET
        [QueueID] = @QueueID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Data] = @Data,
        [Options] = @Options,
        [Output] = @Output,
        [ErrorMessage] = @ErrorMessage,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueueTasks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueueTasks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueueTask table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQueueTask]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQueueTask];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueueTask
ON [${flyway:defaultSchema}].[QueueTask]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueueTask]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueueTask] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Queue Tasks */




/* spDelete SQL for Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: spDeleteQueueTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueueTask
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQueueTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQueueTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueueTask]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QueueTask]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for Queue Tasks */




/* Base View SQL for Queues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: vwQueues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Queues
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Queue
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueues]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueues];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueues]
AS
SELECT
    q.*,
    QueueType_QueueTypeID.[Name] AS [QueueType]
FROM
    [${flyway:defaultSchema}].[Queue] AS q
INNER JOIN
    [${flyway:defaultSchema}].[QueueType] AS QueueType_QueueTypeID
  ON
    [q].[QueueTypeID] = QueueType_QueueTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueues] TO [cdp_UI]
    

/* Base View Permissions SQL for Queues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: Permissions for vwQueues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueues] TO [cdp_UI]

/* spCreate SQL for Queues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: spCreateQueue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Queue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQueue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQueue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueue]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @QueueTypeID uniqueidentifier,
    @IsActive bit = NULL,
    @ProcessPID int,
    @ProcessPlatform nvarchar(30),
    @ProcessVersion nvarchar(15),
    @ProcessCwd nvarchar(100),
    @ProcessIPAddress nvarchar(50),
    @ProcessMacAddress nvarchar(50),
    @ProcessOSName nvarchar(25),
    @ProcessOSVersion nvarchar(10),
    @ProcessHostName nvarchar(50),
    @ProcessUserID nvarchar(25),
    @ProcessUserName nvarchar(50),
    @LastHeartbeat datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Queue]
            (
                [ID],
                [Name],
                [Description],
                [QueueTypeID],
                [IsActive],
                [ProcessPID],
                [ProcessPlatform],
                [ProcessVersion],
                [ProcessCwd],
                [ProcessIPAddress],
                [ProcessMacAddress],
                [ProcessOSName],
                [ProcessOSVersion],
                [ProcessHostName],
                [ProcessUserID],
                [ProcessUserName],
                [LastHeartbeat]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @QueueTypeID,
                ISNULL(@IsActive, 0),
                @ProcessPID,
                @ProcessPlatform,
                @ProcessVersion,
                @ProcessCwd,
                @ProcessIPAddress,
                @ProcessMacAddress,
                @ProcessOSName,
                @ProcessOSVersion,
                @ProcessHostName,
                @ProcessUserID,
                @ProcessUserName,
                ISNULL(@LastHeartbeat, sysdatetimeoffset())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Queue]
            (
                [Name],
                [Description],
                [QueueTypeID],
                [IsActive],
                [ProcessPID],
                [ProcessPlatform],
                [ProcessVersion],
                [ProcessCwd],
                [ProcessIPAddress],
                [ProcessMacAddress],
                [ProcessOSName],
                [ProcessOSVersion],
                [ProcessHostName],
                [ProcessUserID],
                [ProcessUserName],
                [LastHeartbeat]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @QueueTypeID,
                ISNULL(@IsActive, 0),
                @ProcessPID,
                @ProcessPlatform,
                @ProcessVersion,
                @ProcessCwd,
                @ProcessIPAddress,
                @ProcessMacAddress,
                @ProcessOSName,
                @ProcessOSVersion,
                @ProcessHostName,
                @ProcessUserID,
                @ProcessUserName,
                ISNULL(@LastHeartbeat, sysdatetimeoffset())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueue] TO [cdp_UI]
    

/* spCreate Permissions for Queues */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueue] TO [cdp_UI]



/* spUpdate SQL for Queues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: spUpdateQueue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Queue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQueue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQueue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueue]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @QueueTypeID uniqueidentifier,
    @IsActive bit,
    @ProcessPID int,
    @ProcessPlatform nvarchar(30),
    @ProcessVersion nvarchar(15),
    @ProcessCwd nvarchar(100),
    @ProcessIPAddress nvarchar(50),
    @ProcessMacAddress nvarchar(50),
    @ProcessOSName nvarchar(25),
    @ProcessOSVersion nvarchar(10),
    @ProcessHostName nvarchar(50),
    @ProcessUserID nvarchar(25),
    @ProcessUserName nvarchar(50),
    @LastHeartbeat datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Queue]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [QueueTypeID] = @QueueTypeID,
        [IsActive] = @IsActive,
        [ProcessPID] = @ProcessPID,
        [ProcessPlatform] = @ProcessPlatform,
        [ProcessVersion] = @ProcessVersion,
        [ProcessCwd] = @ProcessCwd,
        [ProcessIPAddress] = @ProcessIPAddress,
        [ProcessMacAddress] = @ProcessMacAddress,
        [ProcessOSName] = @ProcessOSName,
        [ProcessOSVersion] = @ProcessOSVersion,
        [ProcessHostName] = @ProcessHostName,
        [ProcessUserID] = @ProcessUserID,
        [ProcessUserName] = @ProcessUserName,
        [LastHeartbeat] = @LastHeartbeat
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Queue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQueue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQueue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueue
ON [${flyway:defaultSchema}].[Queue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Queue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Queue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Queues */




/* spDelete SQL for Queues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: spDeleteQueue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Queue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQueue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQueue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Queue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for Queues */




/* Index for Foreign Keys for RecommendationRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RecommendationProviderID in table RecommendationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecommendationRun_RecommendationProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecommendationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecommendationRun_RecommendationProviderID ON [${flyway:defaultSchema}].[RecommendationRun] ([RecommendationProviderID]);

-- Index for foreign key RunByUserID in table RecommendationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecommendationRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecommendationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecommendationRun_RunByUserID ON [${flyway:defaultSchema}].[RecommendationRun] ([RunByUserID]);

/* Index for Foreign Keys for RecordChangeReplayRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table RecordChangeReplayRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChangeReplayRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChangeReplayRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChangeReplayRun_UserID ON [${flyway:defaultSchema}].[RecordChangeReplayRun] ([UserID]);

/* Base View SQL for Recommendation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: vwRecommendationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Recommendation Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecommendationRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRecommendationRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRecommendationRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecommendationRuns]
AS
SELECT
    r.*,
    RecommendationProvider_RecommendationProviderID.[Name] AS [RecommendationProvider],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[RecommendationRun] AS r
INNER JOIN
    [${flyway:defaultSchema}].[RecommendationProvider] AS RecommendationProvider_RecommendationProviderID
  ON
    [r].[RecommendationProviderID] = RecommendationProvider_RecommendationProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_RunByUserID
  ON
    [r].[RunByUserID] = User_RunByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecommendationRuns] TO [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for Recommendation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: Permissions for vwRecommendationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecommendationRuns] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for Recommendation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: spCreateRecommendationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecommendationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecommendationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecommendationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecommendationRun]
    @ID uniqueidentifier = NULL,
    @RecommendationProviderID uniqueidentifier,
    @StartDate datetimeoffset,
    @EndDate datetimeoffset,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @RunByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecommendationRun]
            (
                [ID],
                [RecommendationProviderID],
                [StartDate],
                [EndDate],
                [Status],
                [Description],
                [RunByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RecommendationProviderID,
                @StartDate,
                @EndDate,
                @Status,
                @Description,
                @RunByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecommendationRun]
            (
                [RecommendationProviderID],
                [StartDate],
                [EndDate],
                [Status],
                [Description],
                [RunByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RecommendationProviderID,
                @StartDate,
                @EndDate,
                @Status,
                @Description,
                @RunByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecommendationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecommendationRun] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Recommendation Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecommendationRun] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Recommendation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: spUpdateRecommendationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecommendationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecommendationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecommendationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecommendationRun]
    @ID uniqueidentifier,
    @RecommendationProviderID uniqueidentifier,
    @StartDate datetimeoffset,
    @EndDate datetimeoffset,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @RunByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecommendationRun]
    SET
        [RecommendationProviderID] = @RecommendationProviderID,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [Status] = @Status,
        [Description] = @Description,
        [RunByUserID] = @RunByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecommendationRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecommendationRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecommendationRun] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecommendationRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecommendationRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecommendationRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecommendationRun
ON [${flyway:defaultSchema}].[RecommendationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecommendationRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecommendationRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Recommendation Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecommendationRun] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Recommendation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: spDeleteRecommendationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecommendationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRecommendationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRecommendationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecommendationRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecommendationRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecommendationRun] TO [cdp_Integration]
    

/* spDelete Permissions for Recommendation Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecommendationRun] TO [cdp_Integration]



/* Base View SQL for Record Change Replay Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: vwRecordChangeReplayRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Record Change Replay Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordChangeReplayRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRecordChangeReplayRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRecordChangeReplayRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordChangeReplayRuns]
AS
SELECT
    r.*,
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[RecordChangeReplayRun] AS r
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordChangeReplayRuns] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Record Change Replay Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: Permissions for vwRecordChangeReplayRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordChangeReplayRuns] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Record Change Replay Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: spCreateRecordChangeReplayRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordChangeReplayRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordChangeReplayRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordChangeReplayRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordChangeReplayRun]
    @ID uniqueidentifier = NULL,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(50),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordChangeReplayRun]
            (
                [ID],
                [StartedAt],
                [EndedAt],
                [Status],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @StartedAt,
                @EndedAt,
                @Status,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordChangeReplayRun]
            (
                [StartedAt],
                [EndedAt],
                [Status],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @StartedAt,
                @EndedAt,
                @Status,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordChangeReplayRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChangeReplayRun] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Record Change Replay Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChangeReplayRun] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Record Change Replay Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: spUpdateRecordChangeReplayRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordChangeReplayRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecordChangeReplayRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordChangeReplayRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordChangeReplayRun]
    @ID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(50),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordChangeReplayRun]
    SET
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecordChangeReplayRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordChangeReplayRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChangeReplayRun] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordChangeReplayRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecordChangeReplayRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecordChangeReplayRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordChangeReplayRun
ON [${flyway:defaultSchema}].[RecordChangeReplayRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordChangeReplayRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordChangeReplayRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Record Change Replay Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChangeReplayRun] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Record Change Replay Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: spDeleteRecordChangeReplayRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordChangeReplayRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRecordChangeReplayRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordChangeReplayRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordChangeReplayRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecordChangeReplayRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordChangeReplayRun] TO [cdp_Integration]
    

/* spDelete Permissions for Record Change Replay Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordChangeReplayRun] TO [cdp_Integration]



/* Index for Foreign Keys for RecordMergeLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table RecordMergeLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordMergeLog_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordMergeLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordMergeLog_EntityID ON [${flyway:defaultSchema}].[RecordMergeLog] ([EntityID]);

-- Index for foreign key InitiatedByUserID in table RecordMergeLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordMergeLog_InitiatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordMergeLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordMergeLog_InitiatedByUserID ON [${flyway:defaultSchema}].[RecordMergeLog] ([InitiatedByUserID]);

-- Index for foreign key ApprovedByUserID in table RecordMergeLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordMergeLog_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordMergeLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordMergeLog_ApprovedByUserID ON [${flyway:defaultSchema}].[RecordMergeLog] ([ApprovedByUserID]);

/* Base View SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: vwRecordMergeLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Record Merge Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordMergeLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRecordMergeLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRecordMergeLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordMergeLogs]
AS
SELECT
    r.*,
    Entity_EntityID.[Name] AS [Entity],
    User_InitiatedByUserID.[Name] AS [InitiatedByUser],
    User_ApprovedByUserID.[Name] AS [ApprovedByUser]
FROM
    [${flyway:defaultSchema}].[RecordMergeLog] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [r].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_InitiatedByUserID
  ON
    [r].[InitiatedByUserID] = User_InitiatedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_ApprovedByUserID
  ON
    [r].[ApprovedByUserID] = User_ApprovedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordMergeLogs] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: Permissions for vwRecordMergeLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordMergeLogs] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: spCreateRecordMergeLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordMergeLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordMergeLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordMergeLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordMergeLog]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @SurvivingRecordID nvarchar(450),
    @InitiatedByUserID uniqueidentifier,
    @ApprovalStatus nvarchar(10) = NULL,
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(10) = NULL,
    @ProcessingStartedAt datetimeoffset = NULL,
    @ProcessingEndedAt datetimeoffset,
    @ProcessingLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordMergeLog]
            (
                [ID],
                [EntityID],
                [SurvivingRecordID],
                [InitiatedByUserID],
                [ApprovalStatus],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingStartedAt],
                [ProcessingEndedAt],
                [ProcessingLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @SurvivingRecordID,
                @InitiatedByUserID,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                ISNULL(@ProcessingStartedAt, sysdatetimeoffset()),
                @ProcessingEndedAt,
                @ProcessingLog,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordMergeLog]
            (
                [EntityID],
                [SurvivingRecordID],
                [InitiatedByUserID],
                [ApprovalStatus],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingStartedAt],
                [ProcessingEndedAt],
                [ProcessingLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @SurvivingRecordID,
                @InitiatedByUserID,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                ISNULL(@ProcessingStartedAt, sysdatetimeoffset()),
                @ProcessingEndedAt,
                @ProcessingLog,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordMergeLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Record Merge Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: spUpdateRecordMergeLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordMergeLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecordMergeLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordMergeLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordMergeLog]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @SurvivingRecordID nvarchar(450),
    @InitiatedByUserID uniqueidentifier,
    @ApprovalStatus nvarchar(10),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(10),
    @ProcessingStartedAt datetimeoffset,
    @ProcessingEndedAt datetimeoffset,
    @ProcessingLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordMergeLog]
    SET
        [EntityID] = @EntityID,
        [SurvivingRecordID] = @SurvivingRecordID,
        [InitiatedByUserID] = @InitiatedByUserID,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingStartedAt] = @ProcessingStartedAt,
        [ProcessingEndedAt] = @ProcessingEndedAt,
        [ProcessingLog] = @ProcessingLog,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecordMergeLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordMergeLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordMergeLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecordMergeLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecordMergeLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordMergeLog
ON [${flyway:defaultSchema}].[RecordMergeLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordMergeLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordMergeLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Record Merge Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: spDeleteRecordMergeLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordMergeLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRecordMergeLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordMergeLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordMergeLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecordMergeLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordMergeLog] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Record Merge Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordMergeLog] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for Template */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Template
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Template_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Template]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Template_CategoryID ON [${flyway:defaultSchema}].[Template] ([CategoryID]);

-- Index for foreign key UserID in table Template
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Template_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Template]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Template_UserID ON [${flyway:defaultSchema}].[Template] ([UserID]);

/* Base View SQL for Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: vwTemplates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Templates
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Template
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTemplates]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTemplates];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTemplates]
AS
SELECT
    t.*,
    TemplateCategory_CategoryID.[Name] AS [Category],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[Template] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[TemplateCategory] AS TemplateCategory_CategoryID
  ON
    [t].[CategoryID] = TemplateCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [t].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTemplates] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: Permissions for vwTemplates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTemplates] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: spCreateTemplate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Template
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTemplate]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTemplate];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTemplate]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserPrompt nvarchar(MAX),
    @UserID uniqueidentifier,
    @ActiveAt datetimeoffset,
    @DisabledAt datetimeoffset,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Template]
            (
                [ID],
                [Name],
                [Description],
                [CategoryID],
                [UserPrompt],
                [UserID],
                [ActiveAt],
                [DisabledAt],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @CategoryID,
                @UserPrompt,
                @UserID,
                @ActiveAt,
                @DisabledAt,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Template]
            (
                [Name],
                [Description],
                [CategoryID],
                [UserPrompt],
                [UserID],
                [ActiveAt],
                [DisabledAt],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @CategoryID,
                @UserPrompt,
                @UserID,
                @ActiveAt,
                @DisabledAt,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTemplates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTemplate] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Templates */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTemplate] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: spUpdateTemplate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Template
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTemplate]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTemplate];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTemplate]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserPrompt nvarchar(MAX),
    @UserID uniqueidentifier,
    @ActiveAt datetimeoffset,
    @DisabledAt datetimeoffset,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Template]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [UserPrompt] = @UserPrompt,
        [UserID] = @UserID,
        [ActiveAt] = @ActiveAt,
        [DisabledAt] = @DisabledAt,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTemplates] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTemplates]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTemplate] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Template table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTemplate]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTemplate];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTemplate
ON [${flyway:defaultSchema}].[Template]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Template]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Template] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Templates */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTemplate] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: spDeleteTemplate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Template
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTemplate]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTemplate];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTemplate]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Template]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTemplate] TO [cdp_Integration]
    

/* spDelete Permissions for Templates */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTemplate] TO [cdp_Integration]



/* Index for Foreign Keys for UserNotification */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserNotification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotification_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotification_UserID ON [${flyway:defaultSchema}].[UserNotification] ([UserID]);

-- Index for foreign key ResourceTypeID in table UserNotification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotification_ResourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotification_ResourceTypeID ON [${flyway:defaultSchema}].[UserNotification] ([ResourceTypeID]);

/* Index for Foreign Keys for UserRecordLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserRecordLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRecordLog_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRecordLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRecordLog_UserID ON [${flyway:defaultSchema}].[UserRecordLog] ([UserID]);

-- Index for foreign key EntityID in table UserRecordLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRecordLog_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRecordLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRecordLog_EntityID ON [${flyway:defaultSchema}].[UserRecordLog] ([EntityID]);

/* Base View Permissions SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: Permissions for vwUserRecordLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserRecordLogs] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spCreateUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserRecordLog]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EarliestAt datetimeoffset = NULL,
    @LatestAt datetimeoffset = NULL,
    @TotalCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserRecordLog]
            (
                [ID],
                [UserID],
                [EntityID],
                [RecordID],
                [EarliestAt],
                [LatestAt],
                [TotalCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @EntityID,
                @RecordID,
                ISNULL(@EarliestAt, sysdatetimeoffset()),
                ISNULL(@LatestAt, sysdatetimeoffset()),
                ISNULL(@TotalCount, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserRecordLog]
            (
                [UserID],
                [EntityID],
                [RecordID],
                [EarliestAt],
                [LatestAt],
                [TotalCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @EntityID,
                @RecordID,
                ISNULL(@EarliestAt, sysdatetimeoffset()),
                ISNULL(@LatestAt, sysdatetimeoffset()),
                ISNULL(@TotalCount, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserRecordLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRecordLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spUpdateUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRecordLog]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EarliestAt datetimeoffset,
    @LatestAt datetimeoffset,
    @TotalCount int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRecordLog]
    SET
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [EarliestAt] = @EarliestAt,
        [LatestAt] = @LatestAt,
        [TotalCount] = @TotalCount
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserRecordLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserRecordLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRecordLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRecordLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserRecordLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserRecordLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserRecordLog
ON [${flyway:defaultSchema}].[UserRecordLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRecordLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserRecordLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spDeleteUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRecordLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserRecordLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRecordLog] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: vwUserNotifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      User Notifications
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserNotification
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserNotifications]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserNotifications];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserNotifications]
AS
SELECT
    u.*,
    User_UserID.[Name] AS [User],
    ResourceType_ResourceTypeID.[Name] AS [ResourceType]
FROM
    [${flyway:defaultSchema}].[UserNotification] AS u
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ResourceType] AS ResourceType_ResourceTypeID
  ON
    [u].[ResourceTypeID] = ResourceType_ResourceTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotifications] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: Permissions for vwUserNotifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotifications] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spCreateUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotification]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID uniqueidentifier,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit = NULL,
    @ReadAt datetimeoffset,
    @ResourceRecordID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserNotification]
            (
                [ID],
                [UserID],
                [Title],
                [Message],
                [ResourceTypeID],
                [ResourceConfiguration],
                [Unread],
                [ReadAt],
                [ResourceRecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @Title,
                @Message,
                @ResourceTypeID,
                @ResourceConfiguration,
                ISNULL(@Unread, 1),
                @ReadAt,
                @ResourceRecordID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserNotification]
            (
                [UserID],
                [Title],
                [Message],
                [ResourceTypeID],
                [ResourceConfiguration],
                [Unread],
                [ReadAt],
                [ResourceRecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @Title,
                @Message,
                @ResourceTypeID,
                @ResourceConfiguration,
                ISNULL(@Unread, 1),
                @ReadAt,
                @ResourceRecordID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserNotifications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for User Notifications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spUpdateUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotification]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID uniqueidentifier,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit,
    @ReadAt datetimeoffset,
    @ResourceRecordID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotification]
    SET
        [UserID] = @UserID,
        [Title] = @Title,
        [Message] = @Message,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceConfiguration] = @ResourceConfiguration,
        [Unread] = @Unread,
        [ReadAt] = @ReadAt,
        [ResourceRecordID] = @ResourceRecordID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserNotifications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserNotifications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserNotification table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserNotification]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserNotification];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserNotification
ON [${flyway:defaultSchema}].[UserNotification]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotification]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserNotification] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User Notifications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spDeleteUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotification]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserNotification]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for User Notifications */




/* Index for Foreign Keys for UserViewRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserViewID in table UserViewRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserViewRun_UserViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserViewRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserViewRun_UserViewID ON [${flyway:defaultSchema}].[UserViewRun] ([UserViewID]);

-- Index for foreign key RunByUserID in table UserViewRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserViewRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserViewRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserViewRun_RunByUserID ON [${flyway:defaultSchema}].[UserViewRun] ([RunByUserID]);

/* Base View SQL for User View Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: vwUserViewRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      User View Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserViewRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserViewRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserViewRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserViewRuns]
AS
SELECT
    u.*,
    UserView_UserViewID.[Name] AS [UserView],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[UserViewRun] AS u
INNER JOIN
    [${flyway:defaultSchema}].[UserView] AS UserView_UserViewID
  ON
    [u].[UserViewID] = UserView_UserViewID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_RunByUserID
  ON
    [u].[RunByUserID] = User_RunByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for User View Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: Permissions for vwUserViewRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for User View Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: spCreateUserViewRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserViewRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserViewRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserViewRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserViewRun]
    @ID uniqueidentifier = NULL,
    @UserViewID uniqueidentifier,
    @RunAt datetimeoffset,
    @RunByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserViewRun]
            (
                [ID],
                [UserViewID],
                [RunAt],
                [RunByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserViewID,
                @RunAt,
                @RunByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserViewRun]
            (
                [UserViewID],
                [RunAt],
                [RunByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserViewID,
                @RunAt,
                @RunByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserViewRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewRun] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for User View Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewRun] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spUpdate SQL for User View Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: spUpdateUserViewRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserViewRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserViewRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserViewRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserViewRun]
    @ID uniqueidentifier,
    @UserViewID uniqueidentifier,
    @RunAt datetimeoffset,
    @RunByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewRun]
    SET
        [UserViewID] = @UserViewID,
        [RunAt] = @RunAt,
        [RunByUserID] = @RunByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserViewRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserViewRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserViewRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserViewRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserViewRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserViewRun
ON [${flyway:defaultSchema}].[UserViewRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserViewRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User View Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for User View Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: spDeleteUserViewRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserViewRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserViewRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserViewRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserViewRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserViewRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for User View Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewRun] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for VersionInstallation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Version Installations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View Permissions SQL for Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Version Installations
-- Item: Permissions for vwVersionInstallations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionInstallations] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Version Installations
-- Item: spCreateVersionInstallation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VersionInstallation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateVersionInstallation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateVersionInstallation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateVersionInstallation]
    @ID uniqueidentifier = NULL,
    @MajorVersion int,
    @MinorVersion int,
    @PatchVersion int,
    @Type nvarchar(20),
    @InstalledAt datetimeoffset,
    @Status nvarchar(20) = NULL,
    @InstallLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[VersionInstallation]
            (
                [ID],
                [MajorVersion],
                [MinorVersion],
                [PatchVersion],
                [Type],
                [InstalledAt],
                [Status],
                [InstallLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MajorVersion,
                @MinorVersion,
                @PatchVersion,
                @Type,
                @InstalledAt,
                ISNULL(@Status, 'Pending'),
                @InstallLog,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[VersionInstallation]
            (
                [MajorVersion],
                [MinorVersion],
                [PatchVersion],
                [Type],
                [InstalledAt],
                [Status],
                [InstallLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MajorVersion,
                @MinorVersion,
                @PatchVersion,
                @Type,
                @InstalledAt,
                ISNULL(@Status, 'Pending'),
                @InstallLog,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwVersionInstallations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionInstallation] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Version Installations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionInstallation] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Version Installations
-- Item: spUpdateVersionInstallation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VersionInstallation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateVersionInstallation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionInstallation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionInstallation]
    @ID uniqueidentifier,
    @MajorVersion int,
    @MinorVersion int,
    @PatchVersion int,
    @Type nvarchar(20),
    @InstalledAt datetimeoffset,
    @Status nvarchar(20),
    @InstallLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionInstallation]
    SET
        [MajorVersion] = @MajorVersion,
        [MinorVersion] = @MinorVersion,
        [PatchVersion] = @PatchVersion,
        [Type] = @Type,
        [InstalledAt] = @InstalledAt,
        [Status] = @Status,
        [InstallLog] = @InstallLog,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwVersionInstallations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwVersionInstallations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionInstallation] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the VersionInstallation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateVersionInstallation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateVersionInstallation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateVersionInstallation
ON [${flyway:defaultSchema}].[VersionInstallation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionInstallation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[VersionInstallation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Version Installations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionInstallation] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Version Installations
-- Item: spDeleteVersionInstallation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VersionInstallation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteVersionInstallation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionInstallation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionInstallation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[VersionInstallation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionInstallation] TO [cdp_Integration]
    

/* spDelete Permissions for Version Installations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionInstallation] TO [cdp_Integration]



/* Index for Foreign Keys for WorkflowRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Workflow Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key WorkflowID in table WorkflowRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WorkflowRun_WorkflowID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WorkflowRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WorkflowRun_WorkflowID ON [${flyway:defaultSchema}].[WorkflowRun] ([WorkflowID]);

/* Base View Permissions SQL for Workflow Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Workflow Runs
-- Item: Permissions for vwWorkflowRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkflowRuns] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Workflow Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Workflow Runs
-- Item: spCreateWorkflowRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR WorkflowRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWorkflowRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWorkflowRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateWorkflowRun]
    @ID uniqueidentifier = NULL,
    @WorkflowID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(500),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nchar(10) = NULL,
    @Results nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[WorkflowRun]
            (
                [ID],
                [WorkflowID],
                [ExternalSystemRecordID],
                [StartedAt],
                [EndedAt],
                [Status],
                [Results]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @WorkflowID,
                @ExternalSystemRecordID,
                @StartedAt,
                @EndedAt,
                ISNULL(@Status, 'Pending'),
                @Results
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[WorkflowRun]
            (
                [WorkflowID],
                [ExternalSystemRecordID],
                [StartedAt],
                [EndedAt],
                [Status],
                [Results]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @WorkflowID,
                @ExternalSystemRecordID,
                @StartedAt,
                @EndedAt,
                ISNULL(@Status, 'Pending'),
                @Results
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwWorkflowRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkflowRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Workflow Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkflowRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Workflow Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Workflow Runs
-- Item: spUpdateWorkflowRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR WorkflowRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWorkflowRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkflowRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkflowRun]
    @ID uniqueidentifier,
    @WorkflowID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(500),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nchar(10),
    @Results nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkflowRun]
    SET
        [WorkflowID] = @WorkflowID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [Results] = @Results
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwWorkflowRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwWorkflowRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkflowRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkflowRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateWorkflowRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateWorkflowRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateWorkflowRun
ON [${flyway:defaultSchema}].[WorkflowRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkflowRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[WorkflowRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Workflow Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkflowRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Workflow Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Workflow Runs
-- Item: spDeleteWorkflowRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WorkflowRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWorkflowRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkflowRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkflowRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[WorkflowRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkflowRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Workflow Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkflowRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: spDeleteQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on DataContextItem using cursor to call spUpdateDataContextItem
    DECLARE @DataContextItemsID uniqueidentifier
    DECLARE @DataContextItems_DataContextID uniqueidentifier
    DECLARE @DataContextItems_Type nvarchar(50)
    DECLARE @DataContextItems_ViewID uniqueidentifier
    DECLARE @DataContextItems_QueryID uniqueidentifier
    DECLARE @DataContextItems_EntityID uniqueidentifier
    DECLARE @DataContextItems_RecordID nvarchar(450)
    DECLARE @DataContextItems_SQL nvarchar(MAX)
    DECLARE @DataContextItems_DataJSON nvarchar(MAX)
    DECLARE @DataContextItems_LastRefreshedAt datetimeoffset
    DECLARE @DataContextItems_Description nvarchar(MAX)
    DECLARE @DataContextItems_CodeName nvarchar(255)
    DECLARE cascade_update_DataContextItems_cursor CURSOR FOR 
        SELECT [ID], [DataContextID], [Type], [ViewID], [QueryID], [EntityID], [RecordID], [SQL], [DataJSON], [LastRefreshedAt], [Description], [CodeName]
        FROM [${flyway:defaultSchema}].[DataContextItem]
        WHERE [QueryID] = @ID
    
    OPEN cascade_update_DataContextItems_cursor
    FETCH NEXT FROM cascade_update_DataContextItems_cursor INTO @DataContextItemsID, @DataContextItems_DataContextID, @DataContextItems_Type, @DataContextItems_ViewID, @DataContextItems_QueryID, @DataContextItems_EntityID, @DataContextItems_RecordID, @DataContextItems_SQL, @DataContextItems_DataJSON, @DataContextItems_LastRefreshedAt, @DataContextItems_Description, @DataContextItems_CodeName
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @DataContextItems_QueryID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDataContextItem] @ID = @DataContextItemsID, @DataContextID = @DataContextItems_DataContextID, @Type = @DataContextItems_Type, @ViewID = @DataContextItems_ViewID, @QueryID = @DataContextItems_QueryID, @EntityID = @DataContextItems_EntityID, @RecordID = @DataContextItems_RecordID, @SQL = @DataContextItems_SQL, @DataJSON = @DataContextItems_DataJSON, @LastRefreshedAt = @DataContextItems_LastRefreshedAt, @Description = @DataContextItems_Description, @CodeName = @DataContextItems_CodeName
        
        FETCH NEXT FROM cascade_update_DataContextItems_cursor INTO @DataContextItemsID, @DataContextItems_DataContextID, @DataContextItems_Type, @DataContextItems_ViewID, @DataContextItems_QueryID, @DataContextItems_EntityID, @DataContextItems_RecordID, @DataContextItems_SQL, @DataContextItems_DataJSON, @DataContextItems_LastRefreshedAt, @DataContextItems_Description, @DataContextItems_CodeName
    END
    
    CLOSE cascade_update_DataContextItems_cursor
    DEALLOCATE cascade_update_DataContextItems_cursor
    
    -- Cascade delete from QueryParameter using cursor to call spDeleteQueryParameter
    DECLARE @MJ_QueryParametersID uniqueidentifier
    DECLARE cascade_delete_MJ_QueryParameters_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryParameter]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJ_QueryParameters_cursor
    FETCH NEXT FROM cascade_delete_MJ_QueryParameters_cursor INTO @MJ_QueryParametersID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryParameter] @ID = @MJ_QueryParametersID
        
        FETCH NEXT FROM cascade_delete_MJ_QueryParameters_cursor INTO @MJ_QueryParametersID
    END
    
    CLOSE cascade_delete_MJ_QueryParameters_cursor
    DEALLOCATE cascade_delete_MJ_QueryParameters_cursor
    
    -- Cascade delete from QueryEntity using cursor to call spDeleteQueryEntity
    DECLARE @QueryEntitiesID uniqueidentifier
    DECLARE cascade_delete_QueryEntities_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryEntity]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_QueryEntities_cursor
    FETCH NEXT FROM cascade_delete_QueryEntities_cursor INTO @QueryEntitiesID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryEntity] @ID = @QueryEntitiesID
        
        FETCH NEXT FROM cascade_delete_QueryEntities_cursor INTO @QueryEntitiesID
    END
    
    CLOSE cascade_delete_QueryEntities_cursor
    DEALLOCATE cascade_delete_QueryEntities_cursor
    
    -- Cascade delete from QueryField using cursor to call spDeleteQueryField
    DECLARE @QueryFieldsID uniqueidentifier
    DECLARE cascade_delete_QueryFields_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryField]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_QueryFields_cursor
    FETCH NEXT FROM cascade_delete_QueryFields_cursor INTO @QueryFieldsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryField] @ID = @QueryFieldsID
        
        FETCH NEXT FROM cascade_delete_QueryFields_cursor INTO @QueryFieldsID
    END
    
    CLOSE cascade_delete_QueryFields_cursor
    DEALLOCATE cascade_delete_QueryFields_cursor
    
    -- Cascade delete from QueryPermission using cursor to call spDeleteQueryPermission
    DECLARE @QueryPermissionsID uniqueidentifier
    DECLARE cascade_delete_QueryPermissions_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryPermission]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_QueryPermissions_cursor
    FETCH NEXT FROM cascade_delete_QueryPermissions_cursor INTO @QueryPermissionsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryPermission] @ID = @QueryPermissionsID
        
        FETCH NEXT FROM cascade_delete_QueryPermissions_cursor INTO @QueryPermissionsID
    END
    
    CLOSE cascade_delete_QueryPermissions_cursor
    DEALLOCATE cascade_delete_QueryPermissions_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Query]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Integration]
    

/* spDelete Permissions for Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Integration]



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '6F5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6F5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F95817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '595717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '72B41F11-F880-45B3-AE45-9B264146F35F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6B5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C334F7B5-EE51-4B08-9437-AD3C8EF5FE4A'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6F5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F85817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6B5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C334F7B5-EE51-4B08-9437-AD3C8EF5FE4A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '8A5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '805717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '815717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E64C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E74C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8A5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '805717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '815717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8A5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'C24217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BF4217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BE4217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C34217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C24217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '36D2D39F-7122-41FE-B78D-9C37B4AAF93F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C34217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C24217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '36D2D39F-7122-41FE-B78D-9C37B4AAF93F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '50DA67D1-BF71-4E90-9F16-74D359285CE5'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '949E0012-3ECD-4DBF-B66F-8A560DA01DA3'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '49218650-7B04-4C4C-B109-A255D6627EAB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '50DA67D1-BF71-4E90-9F16-74D359285CE5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A41E6BF9-7CC3-4B3A-AA78-A2C82DE6EE75'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '99AD5962-A952-4D4A-9B43-10AAAE11A448'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '49218650-7B04-4C4C-B109-A255D6627EAB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '50DA67D1-BF71-4E90-9F16-74D359285CE5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A41E6BF9-7CC3-4B3A-AA78-A2C82DE6EE75'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '99AD5962-A952-4D4A-9B43-10AAAE11A448'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '206573B2-F307-4269-A4E9-196753CA82C0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'BB4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BA4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BB4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BC4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8C5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8F5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BA4C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BC4C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8C5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8F5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '42ABA3A8-027B-4E02-872E-ED5EF7B8A30F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7E5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7F5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline',
       GeneratedFormSection = 'Category',
       DisplayName = 'Direction',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '805717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E64C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E74C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result & Notes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '815717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result & Notes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '825717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result & Notes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '835717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '865817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '875817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8519688b-4ddd-47b6-a641-4cf7658d5d85', '44248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Run Metadata":{"icon":"fa fa-cog","description":""},"Execution Timeline":{"icon":"fa fa-calendar","description":""},"Result & Notes":{"icon":"fa fa-comment","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Run Metadata":"fa fa-cog","Execution Timeline":"fa fa-calendar","Result & Notes":"fa fa-comment"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '44248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 14 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '895717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Communication Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B74C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Communication Provider Message Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B84C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Communication Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B94C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Direction',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BA4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BB4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BC4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BD4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Communication Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8C5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Communication Provider Message Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8F5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Communication Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '42ABA3A8-027B-4E02-872E-ED5EF7B8A30F'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6f167783-2a49-4d0c-a554-942cd2eecee8', '46248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Message Identification":{"icon":"fa fa-id-badge","description":""},"Message Details":{"icon":"fa fa-envelope","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Message Identification":"fa fa-id-badge","Message Details":"fa fa-envelope","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '46248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2AEC7EF2-934A-4296-BF14-F98C9F9B5357'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7825BE5D-B314-4D44-9145-E8641009AA85'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Requested At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '949E0012-3ECD-4DBF-B66F-8A560DA01DA3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Request For User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4DACDDC8-2461-4995-A2CA-469250521F44'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '49218650-7B04-4C4C-B109-A255D6627EAB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Request',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '50DA67D1-BF71-4E90-9F16-74D359285CE5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9087F477-068B-4F38-9EE4-2C0B7BC65A90'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A41E6BF9-7CC3-4B3A-AA78-A2C82DE6EE75'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Request For User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '99AD5962-A952-4D4A-9B43-10AAAE11A448'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Response',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA548A7C-380A-41D7-8E62-1A43376F34F8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Response By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3D9F4176-C838-47F2-8E96-E3D45B588FE6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Responded At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8AE9367C-44FF-4D15-84F9-8742882C3706'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Response By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '206573B2-F307-4269-A4E9-196753CA82C0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '75A2E62E-3914-48B6-9A31-E7728A1B92B0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2BC4635D-0F49-43B5-8E7C-FB57C0D4F6B8'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f8f3e4ad-74e2-4e14-9288-ab8f171f81ae', 'F3C49FE2-B5D9-40D4-8562-6596261772A0', 'FieldCategoryInfo', '{"Request Summary":{"icon":"fa fa-file-alt","description":""},"Response Summary":{"icon":"fa fa-comment","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Request Summary":"fa fa-file-alt","Response Summary":"fa fa-comment","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 28 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '854C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '864C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D70DEF5-99E8-4952-9663-4E437EF9D869'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C334F7B5-EE51-4B08-9437-AD3C8EF5FE4A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '24B12AB7-AE2D-43C3-85D3-917700C1D485'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Definition & Prompting',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Definition & Prompting',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F85817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Definition & Prompting',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F95817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Definition & Prompting',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '874C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Definition & Prompting',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '884C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Definition & Prompting',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B2052C67-0781-4721-A119-3D75007ECAC6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Definition & Prompting',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Compact Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '38312D56-FA69-401A-8698-12BC7F7BA37C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Definition & Prompting',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Compact Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B89BBC2-8FEF-4821-A92C-044E0583900E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Code & Approval',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code',
       ExtendedType = 'Code',
       CodeType = 'TypeScript'
   WHERE ID = '894C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Code & Approval',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Code & Approval',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code Approval Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '545717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Code & Approval',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code Approval Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '555717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Code & Approval',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code Approved By',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '565717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Code & Approval',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code Approved At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '575717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Code & Approval',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code Locked',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Code & Approval',
       GeneratedFormSection = 'Category',
       DisplayName = 'Force Code Generation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '994C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Code & Approval',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code Approved By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display & Execution',
       GeneratedFormSection = 'Category',
       DisplayName = 'Retention Period',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '585717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display & Execution',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '595717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display & Execution',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '72B41F11-F880-45B3-AE45-9B264146F35F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '094D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('fa8c8d4d-e97a-4d65-b718-a898eb707dbd', '38248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Identification & Hierarchy":{"icon":"fa fa-sitemap","description":""},"Display & Execution":{"icon":"fa fa-sliders-h","description":""},"Definition & Prompting":{"icon":"fa fa-pencil-alt","description":""},"Code & Approval":{"icon":"fa fa-code","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Identification & Hierarchy":"fa fa-sitemap","Display & Execution":"fa fa-sliders-h","Definition & Prompting":"fa fa-pencil-alt","Code & Approval":"fa fa-code","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '38248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C04217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C14217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '515817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '525817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '36D2D39F-7122-41FE-B78D-9C37B4AAF93F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timing & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Executed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BF4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timing & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BE4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Call Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Request Method',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C34217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Call Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = 'C24217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Call Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parameters',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C74217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('cb783d36-8181-4317-97b0-3b42cab81571', 'ED238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"System Metadata":{"icon":"fa fa-cog","description":""},"Execution Timing & Status":{"icon":"fa fa-clock","description":""},"API Call Details":{"icon":"fa fa-code","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"System Metadata":"fa fa-cog","Execution Timing & Status":"fa fa-clock","API Call Details":"fa fa-code"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'ED238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '64799DD4-A537-4B9C-897F-EC2AFE9A28D0'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '145817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '425817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '64799DD4-A537-4B9C-897F-EC2AFE9A28D0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '365817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '375817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '425817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '64799DD4-A537-4B9C-897F-EC2AFE9A28D0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '365817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '375817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '4B012AEB-14BF-4AD2-99CF-DF6732F55D70'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DEC0483E-F36B-1410-8DD0-00021F8B792E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E5C0483E-F36B-1410-8DD0-00021F8B792E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'ECC0483E-F36B-1410-8DD0-00021F8B792E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F3C0483E-F36B-1410-8DD0-00021F8B792E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4B012AEB-14BF-4AD2-99CF-DF6732F55D70'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'ECC0483E-F36B-1410-8DD0-00021F8B792E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4B012AEB-14BF-4AD2-99CF-DF6732F55D70'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '1C2E756D-4457-495D-B7BF-43402A1E4E4E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '714D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7D91381D-ABC9-46DD-AA66-3E1909BE1CB2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1C2E756D-4457-495D-B7BF-43402A1E4E4E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2C8D1AD8-7743-46C2-9B40-A7C6C9F0765B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C55717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7D91381D-ABC9-46DD-AA66-3E1909BE1CB2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1C2E756D-4457-495D-B7BF-43402A1E4E4E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2C8D1AD8-7743-46C2-9B40-A7C6C9F0765B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C55717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '764D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '764D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '774D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '784D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A84217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3D5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '764D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '774D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3D5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '12D4D03C-5F1D-41F9-8236-B2E7E440A68D'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EE4E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F24E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '582DC004-6D2A-4006-B707-3B0F2F982912'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '12D4D03C-5F1D-41F9-8236-B2E7E440A68D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FD4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EE4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EF4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '582DC004-6D2A-4006-B707-3B0F2F982912'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '12D4D03C-5F1D-41F9-8236-B2E7E440A68D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FD4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '024417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '034417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '034F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C2E756D-4457-495D-B7BF-43402A1E4E4E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C8D1AD8-7743-46C2-9B40-A7C6C9F0765B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C55717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schedule & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schedule & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '704D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schedule & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Records',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '714D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schedule & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7D91381D-ABC9-46DD-AA66-3E1909BE1CB2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Diagnostic Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '724D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Diagnostic Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '429C9B37-8575-4F2D-9E19-F39378EC3A12'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Diagnostic Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Config Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CB3F1399-7741-4882-99D6-F6CDE80E3897'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0e8c3b4f-b95a-47fc-9861-b389139b99c8', 'E5238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Run Overview":{"icon":"fa fa-briefcase","description":""},"Schedule & Status":{"icon":"fa fa-calendar","description":""},"Diagnostic Details":{"icon":"fa fa-file-alt","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Run Overview":"fa fa-briefcase","Schedule & Status":"fa fa-calendar","Diagnostic Details":"fa fa-file-alt","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 23 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linking & Core Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '115817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linking & Core Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '125817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linking & Core Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '135817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linking & Core Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '145817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linking & Core Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'External System Read Only',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B24217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linking & Core Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '64799DD4-A537-4B9C-897F-EC2AFE9A28D0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linking & Core Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '365817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linking & Core Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '375817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Credentials & Tokens',
       GeneratedFormSection = 'Category',
       DisplayName = 'Access Token',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '155817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Credentials & Tokens',
       GeneratedFormSection = 'Category',
       DisplayName = 'Refresh Token',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '165817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Credentials & Tokens',
       GeneratedFormSection = 'Category',
       DisplayName = 'Token Expiration Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '175817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Credentials & Tokens',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '185817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Credentials & Tokens',
       GeneratedFormSection = 'Category',
       DisplayName = 'Client ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B34217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Credentials & Tokens',
       GeneratedFormSection = 'Category',
       DisplayName = 'Client Secret',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B44217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'External System Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'External System ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '425817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'External System Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Custom Attribute 1',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C44217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'External System Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Class Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '385817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'External System Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Import Path',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '395817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D5917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E85817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run History & Monitoring',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run History & Monitoring',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Run Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run History & Monitoring',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Run Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e76b7a0f-7835-49e8-90df-37c4f0570f5b', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Linking & Core Info":{"icon":"fa fa-link","description":""},"Credentials & Tokens":{"icon":"fa fa-key","description":""},"External System Mapping":{"icon":"fa fa-external-link-alt","description":""},"Run History & Monitoring":{"icon":"fa fa-history","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Linking & Core Info":"fa fa-link","Credentials & Tokens":"fa fa-key","External System Mapping":"fa fa-external-link-alt","Run History & Monitoring":"fa fa-history","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Item Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EC4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Item Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ED4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Item Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '582DC004-6D2A-4006-B707-3B0F2F982912'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Item Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '12D4D03C-5F1D-41F9-8236-B2E7E440A68D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Item Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EE4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FF4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Query',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '004417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '014417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'SQL',
       ExtendedType = 'Code',
       CodeType = 'SQL'
   WHERE ID = 'F04E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '024417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Query',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '034417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Source Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '034F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Cached Snapshot',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data JSON',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F14E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Cached Snapshot',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Refreshed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F24E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CA5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CB5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c796adf1-30a6-418a-86f3-3bf201f8cdda', '23248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Item Identification":{"icon":"fa fa-id-badge","description":""},"Source Definition":{"icon":"fa fa-database","description":""},"Cached Snapshot":{"icon":"fa fa-save","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D0C0483E-F36B-1410-8DD0-00021F8B792E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D7C0483E-F36B-1410-8DD0-00021F8B792E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timing & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Start Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DEC0483E-F36B-1410-8DD0-00021F8B792E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timing & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'End Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E5C0483E-F36B-1410-8DD0-00021F8B792E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timing & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ECC0483E-F36B-1410-8DD0-00021F8B792E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processed Items',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F3C0483E-F36B-1410-8DD0-00021F8B792E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FAC0483E-F36B-1410-8DD0-00021F8B792E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '01C1483E-F36B-1410-8DD0-00021F8B792E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B012AEB-14BF-4AD2-99CF-DF6732F55D70'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Item Identification":"fa fa-id-badge","Source Definition":"fa fa-database","Cached Snapshot":"fa fa-save","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '23248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('9df88d07-4d0f-43c4-bea3-b84687167b2b', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"Timing & Status":{"icon":"fa fa-calendar-check","description":"Key timestamps and current state of a processing run"},"System Metadata":{"icon":"fa fa-cog","description":""},"Run Metadata":{"icon":"fa fa-id-badge","description":""},"Execution Metrics":{"icon":"fa fa-tachometer-alt","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Timing & Status":"fa fa-calendar-check","System Metadata":"fa fa-cog","Run Metadata":"fa fa-id-badge","Execution Metrics":"fa fa-tachometer-alt"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 12 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '734D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '744D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '754D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '764D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Operation Execution',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '774D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Operation Execution',
       GeneratedFormSection = 'Category',
       DisplayName = 'Executed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '784D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Operation Execution',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A84217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EC5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '794D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '335817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('47e8fad9-16b4-496d-ac06-7ed2176e195c', 'E6238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Identifiers & References":{"icon":"fa fa-key","description":""},"Operation Execution":{"icon":"fa fa-cogs","description":""},"Run Audit":{"icon":"fa fa-clock","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Identifiers & References":"fa fa-key","Operation Execution":"fa fa-cogs","Run Audit":"fa fa-clock"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'E6238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '2A4417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3F4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2A4417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2B4417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2C4417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2D4417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2E4417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3F4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2A4417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2D4417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2E4417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2F4417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8AB8D435-3898-46BB-83F4-651FCD7AB339'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E94E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E54E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E44317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E54317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E94E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E54317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E94E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'F94317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F94317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FC4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FE4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F94317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '424417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '364F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '384F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '404417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '424417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '384F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3F4417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '404417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '424417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '414417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'ED4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'ED4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F24317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '673C20C4-0564-44AE-A5A5-05C5078E9AD9'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4BDAAEC2-000A-4420-B7ED-6636F97E8A17'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'ED4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '673C20C4-0564-44AE-A5A5-05C5078E9AD9'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4BDAAEC2-000A-4420-B7ED-6636F97E8A17'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Document Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E34E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Document Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Document',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E44E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Document Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Document',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E94E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Timing & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E54E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Timing & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E44317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Timing & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E54317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DC5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '114D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('571acab0-594b-436a-b945-d22d6eecfd05', '1F248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Document Association":{"icon":"fa fa-file","description":""},"Run Timing & Status":{"icon":"fa fa-clock","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Document Association":"fa fa-file","Run Timing & Status":"fa fa-clock","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '1F248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Match Results',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '284417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Match Results',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duplicate Run Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '294417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Match Results',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Source',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3F4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Match Results',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2A4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Match Results',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Probability',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2B4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Match Results',
       GeneratedFormSection = 'Category',
       DisplayName = 'Matched At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Match Results',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duplicate Run Detail Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8AB8D435-3898-46BB-83F4-651FCD7AB339'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resolution Management',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2D4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resolution Management',
       GeneratedFormSection = 'Category',
       DisplayName = 'Approval Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2E4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resolution Management',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record Merge Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '314417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resolution Management',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record Merge Log Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CB7A4FDC-FF35-4336-8F6A-E628FA4F7CF1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resolution Management',
       GeneratedFormSection = 'Category',
       DisplayName = 'Merge Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2F4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Resolution Management',
       GeneratedFormSection = 'Category',
       DisplayName = 'Merged At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '304417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7F5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '805817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d9e49e46-b770-4f4e-b0ed-b8871f6dc444', '2D248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Match Results":{"icon":"fa fa-search","description":""},"Resolution Management":{"icon":"fa fa-tasks","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Match Results":"fa fa-search","Resolution Management":"fa fa-tasks","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '2D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F84317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F94317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FB4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Refreshed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CC5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CD5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 17 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '334F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '344F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '354F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source List',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3D4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '364F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '374F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3F4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '404417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source List',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '424417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Approval Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Approval Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '384F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Approval Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Approval Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '394F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Approval Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Approved By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Approval Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Approved By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '414417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processing Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processing Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '815817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '825817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f8743af9-6365-43c9-a983-542ba6fb9705', '24248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Identifiers":{"icon":"fa fa-key","description":""},"Context Details":{"icon":"fa fa-info-circle","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Identifiers":"fa fa-key","Context Details":"fa fa-info-circle","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '24248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('57417768-07c3-4857-a901-ab2e4665fe0f', '30248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Run Overview":{"icon":"fa fa-tasks","description":""},"Processing Status":{"icon":"fa fa-flag","description":""},"Approval Information":{"icon":"fa fa-check-circle","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Run Overview":"fa fa-tasks","Processing Status":"fa fa-flag","Approval Information":"fa fa-check-circle","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 14 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EC4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ED4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '673C20C4-0564-44AE-A5A5-05C5078E9AD9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Document Definition & Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Document ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '294F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Document Definition & Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Document Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EE4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Document Definition & Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Document',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4BDAAEC2-000A-4420-B7ED-6636F97E8A17'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vector Embedding',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vector Index ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vector Embedding',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vector ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F04317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vector Embedding',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vector JSON',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F14317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vector Embedding',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vector Index',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '31FDCB9D-A261-4216-95DA-069DDB5891E3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timestamps & Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Record Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F24317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '124D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '134D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('380288c9-9d6a-48d9-86d1-0aecda4b7676', '21248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Identifiers":{"icon":"fa fa-id-card","description":""},"Document Definition & Output":{"icon":"fa fa-file-alt","description":""},"Vector Embedding":{"icon":"fa fa-database","description":""},"Timestamps & Audit":{"icon":"fa fa-calendar","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Identifiers":"fa fa-id-card","Document Definition & Output":"fa fa-file-alt","Vector Embedding":"fa fa-database","Timestamps & Audit":"fa fa-calendar"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '21248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '088A8796-A0C6-4EDE-82E9-8E0BF053423F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '65595F32-31AA-4816-B077-9488CCFE677C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DB8DDD2E-89AC-4582-8BEA-641661E86438'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C612E089-6D4B-48A0-A602-5CE28FCDF9B6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5BDC96C5-0413-443A-ABF8-77650EBFD284'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0FEB23F7-390A-4252-8552-3FB743E916AF'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '96A90EF2-FD85-45EB-880B-A5A129DFDDFF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '65595F32-31AA-4816-B077-9488CCFE677C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3427E9D3-A19A-462F-9D42-7A3F8242A9C4'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0FEB23F7-390A-4252-8552-3FB743E916AF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '43350AA7-95CB-4903-863A-7DB5C6E4361E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6237F9DB-DE75-4867-8F2D-C4F02992D728'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5CF03A74-A899-4393-B270-6F03AE3E8690'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DF28BEC8-CB67-42E7-A7A6-0A060D8F1C22'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '43350AA7-95CB-4903-863A-7DB5C6E4361E'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '43350AA7-95CB-4903-863A-7DB5C6E4361E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '605817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DC4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DD4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DE4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '605817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DC4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E04D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '605817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'F07D4D58-918B-41EC-8C4C-75B77B238954'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D2AFAE6A-85C8-4F86-AAF6-3E2C80F26426'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C82EE5E6-31FA-4B8B-B8E2-7348FF39B59B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1EA0915F-754B-4E6B-B83D-E33C027B75BC'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BCA7B1C6-36B3-4635-9822-45C9CE51811C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F07D4D58-918B-41EC-8C4C-75B77B238954'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EA9BC0FD-B87E-479D-940E-C872CF8A1C8A'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D2AFAE6A-85C8-4F86-AAF6-3E2C80F26426'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C82EE5E6-31FA-4B8B-B8E2-7348FF39B59B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AD40479B-D912-44D0-96BA-237C2D44179C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3522C611-90AE-438D-87F4-3747E36EF94F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F07D4D58-918B-41EC-8C4C-75B77B238954'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EA9BC0FD-B87E-479D-940E-C872CF8A1C8A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'F3050F3E-E62C-47B3-8F6F-F12DC42C86E7'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '403EBB3C-A506-4A45-807C-28B5BE669837'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '74BCF682-06A6-4DDC-BF1E-C7B5601D715E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '621DBFAD-A8A3-4B94-9247-418F4B310FD2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '206BDDB4-41C4-4CC4-8057-43BE145DFE13'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F3050F3E-E62C-47B3-8F6F-F12DC42C86E7'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5603B884-25A8-4D10-94A3-636E59F3E91C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F1D62EEE-FEEF-4D0C-8955-7AB4442A9150'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F9A3491B-AC3C-4CD2-BBC6-6CC0BCD674DA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0524D957-C4AA-4CB6-AFEB-EAA4A0B831A0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '206BDDB4-41C4-4CC4-8057-43BE145DFE13'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F3050F3E-E62C-47B3-8F6F-F12DC42C86E7'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5603B884-25A8-4D10-94A3-636E59F3E91C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F1D62EEE-FEEF-4D0C-8955-7AB4442A9150'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Identity & Queue',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '154317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Identity & Queue',
       GeneratedFormSection = 'Category',
       DisplayName = 'Queue ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Identity & Queue',
       GeneratedFormSection = 'Category',
       DisplayName = 'Queue',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '605817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Timeline',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DC4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Timeline',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Timeline',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DE4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E44D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Options',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E54D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E04D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E14D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5F5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6c8c63eb-ecc2-48f5-aa24-c76516a2290b', '04248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Task Identity & Queue":{"icon":"fa fa-tasks","description":""},"Execution Status & Timeline":{"icon":"fa fa-clock","description":""},"Payload & Outcome":{"icon":"fa fa-file-alt","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Task Identity & Queue":"fa fa-tasks","Execution Status & Timeline":"fa fa-clock","Payload & Outcome":"fa fa-file-alt","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '04248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5F7A6E9C-83E2-4801-A8A2-8B25ACA186BE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D68692E0-7BD0-4F6E-A0A1-683FA45B58FE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '67B00A5A-4470-4AB9-8171-50F3CDD8FA88'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2114C507-DB13-4864-8CF8-76B205F55FE3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Reviewer',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C1D5A2EF-26DA-4DAA-9133-0F24A8181872'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Reviewer Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '43350AA7-95CB-4903-863A-7DB5C6E4361E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Reviewed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF28BEC8-CB67-42E7-A7A6-0A060D8F1C22'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Feedback Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Rating',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6237F9DB-DE75-4867-8F2D-C4F02992D728'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Feedback Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Correct',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5CF03A74-A899-4393-B270-6F03AE3E8690'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Feedback Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Correction Summary',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '45B5576A-D6C5-4798-9E4A-801DFB999420'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Feedback Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D826D87-CCFB-4753-B6FD-193621FFA498'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-clipboard-check */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-clipboard-check',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '99B00220-BABA-4C42-BC7C-00E1EE14651C'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b6caae5a-42e4-4623-b66e-95e08a0d4440', '99B00220-BABA-4C42-BC7C-00E1EE14651C', 'FieldCategoryInfo', '{"Feedback Content":{"icon":"fa fa-comment-dots","description":"Reviewer ratings, correctness flag, and detailed correction notes"},"Review Context":{"icon":"fa fa-user","description":"Information about which test run was reviewed, who reviewed it, and when"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields and primary identifier"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('132acf72-e0af-45fe-a00a-37ecb7385d7d', '99B00220-BABA-4C42-BC7C-00E1EE14651C', 'FieldCategoryIcons', '{"Feedback Content":"fa fa-comment-dots","Review Context":"fa fa-user","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set categories for 24 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Suite',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F9DC6CA0-D197-4BC1-843C-4FB72EA118E7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A0C22922-47CD-427D-B0A4-8C0C047FDE70'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2AFAE6A-85C8-4F86-AAF6-3E2C80F26426'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Trigger Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C82EE5E6-31FA-4B8B-B8E2-7348FF39B59B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Git Commit',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD40479B-D912-44D0-96BA-237C2D44179C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3522C611-90AE-438D-87F4-3747E36EF94F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Suite Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F07D4D58-918B-41EC-8C4C-75B77B238954'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EA9BC0FD-B87E-479D-940E-C872CF8A1C8A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1EA0915F-754B-4E6B-B83D-E33C027B75BC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BCA7B1C6-36B3-4635-9822-45C9CE51811C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B3AD9C4-0DF8-4128-A90E-9449FF3D53BE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Tests',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5752BA11-C1FA-4A45-8761-4396E9D9165B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Passed Tests',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '58F57666-1327-4F93-8E57-85DE91AA141A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Failed Tests',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F6306495-EE6F-447A-9F9D-6455EEE10355'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Skipped Tests',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E3C00A2-5683-4532-A717-CB994DE9B501'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Tests',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EC2EA1C2-B5DF-46BD-AB72-9A4B6FA3E5B5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Duration Seconds',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8C6DEC81-DA98-4581-9735-67100444919B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Cost USD',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '503FA777-2E62-45B3-8D4D-6E054F574C28'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2D07688B-F6F8-4281-A4BA-A45533E0ECCA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Result Summary',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B651E95D-9675-464F-B2F6-CC71234A1A17'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '760DA45F-0330-4776-8E30-27118035581D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '520BD647-B226-4D88-852D-754E18B10CDD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B947CA05-E3D0-4A60-BADF-946EDFDAB6E4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2D88912D-6C51-4E18-888D-8F576F342969'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-flask */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-flask',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c0b7d705-3ba1-4cbe-b158-5902bbb107be', '61438D17-BE0C-4BFF-A1B3-C014279A3BA7', 'FieldCategoryInfo', '{"Run Identification":{"icon":"fa fa-play-circle","description":"Key identifiers and context for the suite execution such as suite reference, trigger, environment, and version details"},"Execution Timeline & Status":{"icon":"fa fa-clock","description":"Lifecycle timestamps and current status of the suite run"},"Test Metrics":{"icon":"fa fa-chart-line","description":"Aggregated counts, durations, and cost information for the executed tests"},"Technical Output":{"icon":"fa fa-file-code","description":"Raw configuration, result JSON and any error messages generated by the run"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields and primary identifier"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f5a89e8b-67d4-4101-876d-43b20404b83b', '61438D17-BE0C-4BFF-A1B3-C014279A3BA7', 'FieldCategoryIcons', '{"Run Identification":"fa fa-play-circle","Execution Timeline & Status":"fa fa-clock","Test Metrics":"fa fa-chart-line","Technical Output":"fa fa-file-code","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set categories for 25 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '198553FB-E3EB-44EA-9B0F-9255D20A837A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '690BF97C-3C43-45AC-BF0F-519E37E34847'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '313268F4-A069-46E8-8EE5-977F962EE18F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '217D524D-8C3E-4EAC-8F5A-5F83EA4FE66A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A67615F-FFD9-40F2-8BB4-6488ED7889A9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0FEB23F7-390A-4252-8552-3FB743E916AF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '96A90EF2-FD85-45EB-880B-A5A129DFDDFF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target Log ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C05BE7DE-C0A5-4A5A-9CC0-EBF0AC47BA7B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Suite Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '474B4535-FEF5-4F52-AB4B-0FF00D355F81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '088A8796-A0C6-4EDE-82E9-8E0BF053423F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '65595F32-31AA-4816-B077-9488CCFE677C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB8DDD2E-89AC-4582-8BEA-641661E86438'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C612E089-6D4B-48A0-A602-5CE28FCDF9B6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (seconds)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC65C4D6-DF53-4ADF-8E89-52D8758E1FC0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Input & Expected Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F3A5CA76-8028-40BE-A9E6-3D64B28B63E7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Input & Expected Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expected Output Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C25A0964-8F7C-4524-93AC-8FE405F81984'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Input & Expected Output',
       GeneratedFormSection = 'Category',
       DisplayName = 'Actual Output Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '10DC4732-7E88-4011-A7DA-DC61A9C4E9E0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Passed Checks',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '103DC144-D077-4AE9-9F8C-DB5DB9CBB006'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Failed Checks',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9529238-E9DE-4272-893F-C5896EE0E2B4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Checks',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0AF62261-73BC-4F22-BE99-206342B98760'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5BDC96C5-0413-443A-ABF8-77650EBFD284'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cost (USD)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '27FBF8EA-72D5-4ED0-B8A9-5E112B8DCB88'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3427E9D3-A19A-462F-9D42-7A3F8242A9C4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Result Details',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '806F24FE-646E-4AC4-968F-14E067DC43BD'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-flask */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-flask',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('07af2c04-c79b-45cf-a917-a4122cfafab9', '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', 'FieldCategoryInfo', '{"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields that track record creation and modification"},"Test & Target Info":{"icon":"fa fa-bullseye","description":"Identifiers and descriptive fields linking the run to its test definition and execution target"},"Run Metadata":{"icon":"fa fa-clock","description":"Timing, status and sequencing information that describes how and when the test was executed"},"Input & Expected Output":{"icon":"fa fa-database","description":"JSON payloads representing inputs supplied to the test and the expected versus actual outputs"},"Result Analysis":{"icon":"fa fa-chart-line","description":"Validation metrics, scores, cost and diagnostic details produced by the test execution"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('75dbe6a7-3ae0-4012-9b91-0e4aacf43491', '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', 'FieldCategoryIcons', '{"System Metadata":"fa fa-cog","Test & Target Info":"fa fa-bullseye","Run Metadata":"fa fa-clock","Input & Expected Output":"fa fa-database","Result Analysis":"fa fa-chart-line"}', GETUTCDATE(), GETUTCDATE())
            

/* Set categories for 97 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BB1A9EFA-52A5-4D39-A67B-0C623C037EA8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9407CD9F-EB55-4BB5-8CDD-5D2E70D9D739'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '71548843-FAAA-493F-A7D3-FDCB4A3A80DF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F4E86C22-D315-4DB1-9DA1-A5779B78EAAC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C1D2EC52-E3DE-46E1-A7B7-C353C811E74C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE9C78CB-14F9-4F2D-85A1-51860E35C95B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '403EBB3C-A506-4A45-807C-28B5BE669837'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C292566B-AEB6-495C-B228-97F4509E159F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Execution Time (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C2E9D77-1A55-40B2-A6B5-B385BB95C14F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '621DBFAD-A8A3-4B94-9247-418F4B310FD2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F9A3491B-AC3C-4CD2-BBC6-6CC0BCD674DA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '559A6C83-012D-436E-BCD0-BF5BC195D1DD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0524D957-C4AA-4CB6-AFEB-EAA4A0B831A0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Execution Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '54DFB777-475B-4C79-A736-10556471D86E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3527B188-23DD-4C21-8716-BD17A5E05BB5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Rerun From Prompt Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF55FAF1-BC63-432B-9137-5D0678DC08AA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '206BDDB4-41C4-4CC4-8057-43BE145DFE13'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cancelled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '70260832-4420-451A-9A22-359FD83885FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cancellation Reason',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '085BE7AF-5389-43C0-BEE4-3748840E61F6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cache Hit',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1E91D9BA-2775-488F-B647-EB44EF9E6112'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cache Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D6AC347-E634-4846-B9F3-B9F46FBE16CC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Was Selected Result',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A3908B7-C914-48AD-9C91-3095CB4B6475'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Streaming Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '69C2BA6E-FB8B-4F52-90CF-6D4D3FEAB81B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'First Token Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F2B24363-336F-48D2-9B68-D9A81B27A224'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Details',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B843B2C-8CC0-4B48-814C-1BF3B88D69BA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Child Prompt ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2CD14363-BDDB-45BA-AEDE-731EE053CAB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F3050F3E-E62C-47B3-8F6F-F12DC42C86E7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '037160AF-8D33-43F7-9C60-F200306B6DBC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F9F9EC70-B3C6-4619-9A43-0D8986A28A85'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Rerun From Prompt Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '55613DC7-0DDA-43AF-AE04-0F3D2BC709D0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CECDF34F-B76C-421E-9746-416F3C1CAB0B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B04C39C-CB71-464E-95BD-FFE0473C3799'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B9212269-5523-48F4-8C80-71FEDBDA14AD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Execution Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Rerun From Prompt Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E433AB22-95B8-42C7-921E-37B9BB04E6E2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Messages',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A863F3D6-18E5-4FBD-B498-BC74BB6C7592'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Result',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D3C9BC7E-8FDA-4CC9-A6AF-F928183ED4EC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Stop Sequences',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '81BC5339-5D6D-41F7-8D40-B619AC308284'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Response Format',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '500B3FE9-F420-4036-AD0A-0CC999E6478A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Judge ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CC0E9225-A041-4DA5-8C1C-AB26091D9A37'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Judge Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FCF30C26-0363-49F8-AF94-D8403348A6F1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model Specific Response Details',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '645594E9-9A4D-4302-9268-C5D0656D4189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E114B8EB-89A2-4EF2-A45E-0D52E011FCCE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5603B884-25A8-4D10-94A3-636E59F3E91C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1D62EEE-FEEF-4D0C-8955-7AB4442A9150'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2DE35331-2554-4E99-8C8E-2FB392B3B658'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F7A51776-F0C9-4411-9481-E46DC3EE9D4F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Original Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E939815B-9896-49C5-BA22-6E25BEFE2F34'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Judge',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '20386410-106D-4540-A077-111FF35B281C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Result Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Child Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6EE88511-CE87-4BA6-AA0F-DA675C5C757B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tokens Used',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8EB9EB12-02C0-4D19-BC14-0DC706C9EE58'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tokens Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '82D0E001-0826-44BC-B394-0299DAFBBB62'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tokens Completion',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4F3C2E1E-2F65-4B98-82BB-CB48B6285546'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Cost',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '74BCF682-06A6-4DDC-BF1E-C7B5601D715E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cost',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ADCD9C84-0FB1-45F4-9A9F-B42BD51A2503'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cost Currency',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2A925F19-E0EA-41AF-8323-4542F310A09E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tokens Used Rollup',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '16B3DCD4-E1A3-456B-AC93-FF72B2507B19'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tokens Prompt Rollup',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '05F66D0A-9E5B-4A31-9B03-F26DF3FA70B1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tokens Completion Rollup',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BF642024-62C7-41E2-86AA-FCE253463DE1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Descendant Cost',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E1E51DB3-0F7A-4A20-8E82-0CE8E9257F47'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Failover Attempts',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C84B4CE2-5FE8-4BE0-9A3A-D0C5440E58B8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Failover Errors',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '67CB5D9F-21C7-472F-968B-1A546D4DF8B1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Failover Durations',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E592040A-9AB1-4181-974D-D40598259CF2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Original Model ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '12569670-4ECE-445A-ADCF-E3018DC1B723'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Original Request Start Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '24CB1A5A-CC8F-4FAB-BCF8-3324534165BF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Failover Duration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C1D702A-F8B3-4B2B-8B88-E64621FDAA08'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Queue Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9DF1B01F-510B-481F-A669-F0C128437817'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '01E72544-1D2A-4FF2-9BC0-497E41F65473'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Cost Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completion Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '248F35BE-627E-4A29-8A08-CAB9DF3BA396'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Temperature',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '95C3A075-173A-4858-9EC2-49EF6B976669'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Top P',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B7B30E68-EE85-4883-96D9-A1E3053396DF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Top K',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C39350C9-4593-4129-A130-73C730EE8559'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Min P',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EBC17D08-2D86-4B7C-9B37-3A9D19E1E98F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Frequency Penalty',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F4723C61-222A-40F3-9C97-941715514B96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Presence Penalty',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF8F23C2-DEFE-442D-BD79-2178777C48EA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Seed',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DED8E59B-666C-4D6E-9CEA-EB762B444F42'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Log Probs',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '180A9E6F-8C78-42F1-9187-D969F3A0DFF2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Top Log Probs',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5601E9C4-A756-4453-8117-E8E5460CAEFC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model Selection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F7B5B241-3D39-4715-80CA-77AB79AF8374'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model Power Rank',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FF696B62-DD4F-4D12-A120-27464D4F3BEE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Selection Strategy',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0F79694C-7A55-4E18-BBF6-C0A3B8D9BAF0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Parameters & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Effort Level',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B1032DB-F8AF-4EAF-9F03-7B9049FBA39D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Validation Attempt Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E5C8EB19-4E38-4962-A9C3-01B99B2CAF71'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Successful Validation Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BB43B8DA-7A21-4734-9EE0-49BBAB0A2EBC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Validation Passed',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B818BC71-69CA-48AB-8E82-FDBA4ACE9B9E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Validation Behavior',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '19C655EA-36B6-4D1E-AD16-07E68D848C07'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Retry Strategy',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D8524915-5BE7-4BF6-8751-847427DCDFF5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Retries Configured',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '90035368-1453-43A8-B3D0-F822A75E63C3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Validation Error',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A56CAAE4-C17C-4217-BF68-D4D1CE427ADF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Validation Error Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA772A8F-17FC-453A-AB19-69766C073663'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Common Validation Error',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2F7169BB-CDD8-43BE-B74D-C2D2D5AA2734'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'First Attempt At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3FB83B39-DC79-4824-91B1-F4C7AC91FD50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Attempt At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '70717F1D-4FF4-488A-8BE4-0A2D47A0C702'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Retry Duration (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '10064F90-AA41-4DC5-981B-D308C767FD63'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Validation Attempts',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '33BF165E-77A3-447D-94F3-DCB61EF83698'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Validation & Retry Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Validation Summary',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '730E6B0B-B28C-4E90-A879-003181340C68'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BAFFFCD7-77C9-4716-A0E2-60C41814CCC8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C32DE832-7849-457C-9A45-5F9BE3AF68CE'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ab9a641e-bc5b-48ec-83d9-45771bd0c1a0', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'FieldCategoryInfo', '{"Run Execution Core":{"icon":"fa fa-cog","description":""},"Prompt & Result Content":{"icon":"fa fa-file-alt","description":""},"Model Parameters & Settings":{"icon":"fa fa-sliders-h","description":""},"Performance & Cost Metrics":{"icon":"fa fa-chart-line","description":""},"Validation & Retry Details":{"icon":"fa fa-check-circle","description":""},"System Metadata":{"icon":"fa fa-database","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Run Execution Core":"fa fa-cog","Prompt & Result Content":"fa fa-file-alt","Model Parameters & Settings":"fa fa-sliders-h","Performance & Cost Metrics":"fa fa-chart-line","Validation & Retry Details":"fa fa-check-circle","System Metadata":"fa fa-database"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '114317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '114317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '144317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '174317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5A4E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '114317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '124317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EB4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EE4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '194317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5A4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'F94C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F54C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F64C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F74C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F94C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F74C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F94C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '714317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '504317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '524317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '544317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '554317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '564317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '704317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '714317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '88E1CCE0-718D-4C29-8B32-ED103AFA5D44'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '504317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '524317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '544317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '704317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '714317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '88E1CCE0-718D-4C29-8B32-ED103AFA5D44'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E44C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A35717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A45717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A55717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E44C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E54C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A55717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E44C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E54C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '915717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '915717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CF4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C84C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C94C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '915717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C84C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C94C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F44C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F84C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F94C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Timing & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F54C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Timing & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F64C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Timing & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F74C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '055917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '065917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E24C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A25717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A75717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Schedule & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Start Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A35717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Schedule & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'End Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A45717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Schedule & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A55717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Description',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A65717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Description',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E44C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Description',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E54C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '015917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '025917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d084ed5d-e9af-4ea8-97dd-c6cc059f78b0', '53248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Run Identification":{"icon":"fa fa-id-card","description":""},"Run Timing & Status":{"icon":"fa fa-clock","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0267c551-1785-4676-ae00-1ad735c83c38', '4F248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Run Identification":{"icon":"fa fa-id-badge","description":""},"Run Schedule & Status":{"icon":"fa fa-calendar-alt","description":""},"Run Description":{"icon":"fa fa-align-left","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Run Identification":"fa fa-id-card","Run Timing & Status":"fa fa-clock","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '53248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Run Identification":"fa fa-id-badge","Run Schedule & Status":"fa fa-calendar-alt","Run Description":"fa fa-align-left","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '4F248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 16 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Merge Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '484E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Merge Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '494E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Merge Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Surviving Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '504317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Merge Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '704317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Actions & Approvals',
       GeneratedFormSection = 'Category',
       DisplayName = 'Initiated By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '514317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Actions & Approvals',
       GeneratedFormSection = 'Category',
       DisplayName = 'Approval Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '524317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Actions & Approvals',
       GeneratedFormSection = 'Category',
       DisplayName = 'Approved By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '534317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Actions & Approvals',
       GeneratedFormSection = 'Category',
       DisplayName = 'Initiated By User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '714317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Actions & Approvals',
       GeneratedFormSection = 'Category',
       DisplayName = 'Approved By User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '88E1CCE0-718D-4C29-8B32-ED103AFA5D44'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processing Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '544317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processing Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '554317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processing Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '564317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processing Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '574317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '584317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '735817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '745817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('12645be0-c45e-4b9d-8046-77b01ad1709f', '17248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Merge Identification":{"icon":"fa fa-id-badge","description":""},"Execution Details":{"icon":"fa fa-cogs","description":""},"User Actions & Approvals":{"icon":"fa fa-user-check","description":""},"System Metadata":{"icon":"fa fa-database","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Merge Identification":"fa fa-id-badge","Execution Details":"fa fa-cogs","User Actions & Approvals":"fa fa-user-check","System Metadata":"fa fa-database"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '17248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 20 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Queue Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '104317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Queue Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '114317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Queue Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '124317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Queue Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Queue Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '134317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Queue Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Queue Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Operational Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '144317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Operational Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Heartbeat',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '174317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Process Environment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Process ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E74D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Process Environment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Process Platform',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E84D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Process Environment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Process Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E94D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Process Environment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Process Working Directory',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EA4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Process Environment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Process IP Address',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Process Environment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Process MAC Address',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '184317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Process Environment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Process OS Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EC4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Process Environment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Process OS Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ED4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Process Environment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Process Host Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EE4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Process Environment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Process User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '164317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Process Environment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Process User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '194317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '905717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8F5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '915717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '925717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CC4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '935717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '945717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C84C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C94C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Availability & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CD4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Availability & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Disabled At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Availability & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CF4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f65d415d-fbe1-4c3b-bdb0-ba4af25a0415', '48248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Template Content":{"icon":"fa fa-pencil-alt","description":""},"Availability & Status":{"icon":"fa fa-clock","description":""},"Associations":{"icon":"fa fa-link","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3161b434-7a77-44dc-a78a-f3fb97d619c3', '03248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Queue Definition":{"icon":"fa fa-list-alt","description":""},"Operational Status":{"icon":"fa fa-tachometer-alt","description":""},"Process Environment":{"icon":"fa fa-server","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Template Content":"fa fa-pencil-alt","Availability & Status":"fa fa-clock","Associations":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '48248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Queue Definition":"fa fa-list-alt","Operational Status":"fa fa-tachometer-alt","Process Environment":"fa fa-server"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '03248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '4D4E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A74D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4D4E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4E4E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4D4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4E4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '4D4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D54217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D14217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D24217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D44217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4D4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D54217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D44217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4D4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4E4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6F4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6F4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '6C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2A5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2B5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2C5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2D5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6E4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2A5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6E4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6F4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '704F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '224F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1D4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '224F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1D4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '224F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A84D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'User View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A94D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'User View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A74D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4E4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A35817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A45817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('bc686297-22cc-433a-88af-895fe68e78e6', 'F0238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"View Definition":{"icon":"fa fa-file-alt","description":""},"Execution Details":{"icon":"fa fa-clock","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"View Definition":"fa fa-file-alt","Execution Details":"fa fa-clock","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '544F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '554F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Title',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '574F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Unread',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Read At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '584F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '594F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a8cbc941-e4d8-4506-8dd3-d78dcf1e40da', '14248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Notification Overview":{"icon":"fa fa-bell","description":""},"Related Resource":{"icon":"fa fa-link","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Notification Overview":"fa fa-bell","Related Resource":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '14248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Workflow Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D34217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Workflow Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Workflow ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C68C8778-B939-EF11-86D4-000D3A4E707E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Workflow Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'External System Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D54217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Workflow Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Workflow Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Workflow Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Workflow Engine',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4E4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D14217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D24217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D44217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Timeline & Outcome',
       GeneratedFormSection = 'Category',
       DisplayName = 'Results',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D64217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F15817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F25817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6fc2c7b3-f65d-44b9-a9e6-cc4cde33b1a4', 'F2238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Workflow Identification":{"icon":"fa fa-project-diagram","description":""},"Execution Timeline & Outcome":{"icon":"fa fa-tachometer-alt","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Workflow Identification":"fa fa-project-diagram","Execution Timeline & Outcome":"fa fa-tachometer-alt","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F2238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '275817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '285817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '295817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Interaction Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2A5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Interaction Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Earliest At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Interaction Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Latest At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Interaction Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E95817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EA5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Full Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '6E4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Supervisor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'Supervisor Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '704F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b3749307-07ad-42ee-a88b-1cc7c07824ec', 'E3238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Technical Details":{"icon":"fa fa-cog","description":""},"User Profile":{"icon":"fa fa-user","description":""},"Interaction Summary":{"icon":"fa fa-clock","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Technical Details":"fa fa-cog","User Profile":"fa fa-user","Interaction Summary":"fa fa-clock"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'E3238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 12 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '174F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Version Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Major Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '184F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Version Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Minor Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '194F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Version Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Patch Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Execution',
       GeneratedFormSection = 'Category',
       DisplayName = 'Installation Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Execution',
       GeneratedFormSection = 'Category',
       DisplayName = 'Installed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Execution',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1D4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Documentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Install Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1E4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Documentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1F4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F55817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F65817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Documentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Complete Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '224F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6b875a8d-bbd6-4725-ba2d-f29f45bf4336', '2C248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Version Details":{"icon":"fa fa-tags","description":""},"Installation Execution":{"icon":"fa fa-play","description":""},"Installation Documentation":{"icon":"fa fa-file-alt","description":""},"System Metadata":{"icon":"fa fa-database","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Version Details":"fa fa-tags","Installation Execution":"fa fa-play","Installation Documentation":"fa fa-file-alt","System Metadata":"fa fa-database"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '2C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

