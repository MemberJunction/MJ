/*
 * Migration: Add Tags field to TestSuiteRun and TestRun entities
 * Purpose: Enable user-assigned labels/tags for test runs to support:
 *   - Comparing runs with different configurations (e.g., "Opus 4.5" vs "GPT 5.2")
 *   - Tracking experiment variations
 *   - Filtering and grouping in analytics views
 *
 * Format: JSON array of strings, e.g., ["Opus 4.5", "Prompt v3", "Production Config"]
 */


-- WE had another 3.1 migration that did mutation on Test Runs so need this reset stuff

/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to sync schema info from database schemas */
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to recompile all stored procedures in dependency order */
EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1

--- THEN WE CAN DO our migration


GO

-- Add Tags column to TestSuiteRun table
ALTER TABLE ${flyway:defaultSchema}.TestSuiteRun
ADD Tags NVARCHAR(MAX) NULL;

-- Add Tags column to TestRun table
ALTER TABLE ${flyway:defaultSchema}.TestRun
ADD Tags NVARCHAR(MAX) NULL;
GO

-- Add extended property descriptions for TestSuiteRun.Tags
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of user-assigned tags/labels for this suite run. Used for categorization, filtering, and comparing runs with different configurations (e.g., ["Opus 4.5", "New Prompt v3", "Production Config"]).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestSuiteRun',
    @level2type = N'COLUMN', @level2name = 'Tags';

-- Add extended property descriptions for TestRun.Tags
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of user-assigned tags/labels for this test run. Used for categorization, filtering, and comparing runs with different configurations. Inherits from parent suite run tags if not explicitly set.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestRun',
    @level2type = N'COLUMN', @level2name = 'Tags';




































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '397883c9-1ef4-4110-990f-b2d20ab70ef8'  OR 
               (EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'Tags')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '397883c9-1ef4-4110-990f-b2d20ab70ef8',
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', -- Entity: MJ: Test Runs
            100052,
            'Tags',
            'Tags',
            'JSON array of user-assigned tags/labels for this test run. Used for categorization, filtering, and comparing runs with different configurations. Inherits from parent suite run tags if not explicitly set.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2bfacae1-586a-4682-bf69-d029ea451485'  OR 
               (EntityID = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' AND Name = 'Tags')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2bfacae1-586a-4682-bf69-d029ea451485',
            '61438D17-BE0C-4BFF-A1B3-C014279A3BA7', -- Entity: MJ: Test Suite Runs
            100047,
            'Tags',
            'Tags',
            'JSON array of user-assigned tags/labels for this suite run. Used for categorization, filtering, and comparing runs with different configurations (e.g., ["Opus 4.5", "New Prompt v3", "Production Config"]).',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

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
    TestSuiteRun_TestSuiteRunID.[Suite] AS [TestSuiteRun],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[TestRun] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Test] AS Test_TestID
  ON
    [t].[TestID] = Test_TestID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestSuiteRuns] AS TestSuiteRun_TestSuiteRunID
  ON
    [t].[TestSuiteRunID] = TestSuiteRun_TestSuiteRunID.[ID]
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
    @ResultDetails nvarchar(MAX),
    @Log nvarchar(MAX),
    @Tags nvarchar(MAX)
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
                [ResultDetails],
                [Log],
                [Tags]
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
                @ResultDetails,
                @Log,
                @Tags
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
                [ResultDetails],
                [Log],
                [Tags]
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
                @ResultDetails,
                @Log,
                @Tags
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
    @ResultDetails nvarchar(MAX),
    @Log nvarchar(MAX),
    @Tags nvarchar(MAX)
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
        [ResultDetails] = @ResultDetails,
        [Log] = @Log,
        [Tags] = @Tags
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
    @ErrorMessage nvarchar(MAX),
    @Tags nvarchar(MAX)
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
                [ErrorMessage],
                [Tags]
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
                @ErrorMessage,
                @Tags
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
                [ErrorMessage],
                [Tags]
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
                @ErrorMessage,
                @Tags
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
    @ErrorMessage nvarchar(MAX),
    @Tags nvarchar(MAX)
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
        [ErrorMessage] = @ErrorMessage,
        [Tags] = @Tags
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



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
            AND AutoUpdateIsNameField = 1
         

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
               WHERE ID = '397883C9-1EF4-4110-990F-B2D20AB70EF8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DF46472C-28A2-4352-8699-D29597540B8D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0FEB23F7-390A-4252-8552-3FB743E916AF'
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
            WHERE ID = '7B3AD9C4-0DF8-4128-A90E-9449FF3D53BE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5752BA11-C1FA-4A45-8761-4396E9D9165B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '58F57666-1327-4F93-8E57-85DE91AA141A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F6306495-EE6F-447A-9F9D-6455EEE10355'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8C6DEC81-DA98-4581-9735-67100444919B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F07D4D58-918B-41EC-8C4C-75B77B238954'
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
               WHERE ID = '1EA0915F-754B-4E6B-B83D-E33C027B75BC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2BFACAE1-586A-4682-BF69-D029EA451485'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F07D4D58-918B-41EC-8C4C-75B77B238954'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EA9BC0FD-B87E-479D-940E-C872CF8A1C8A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 28 fields */
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
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A67615F-FFD9-40F2-8BB4-6488ED7889A9'
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
       DisplayName = 'Target Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C05BE7DE-C0A5-4A5A-9CC0-EBF0AC47BA7B'
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
       DisplayName = 'Run By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0FEB23F7-390A-4252-8552-3FB743E916AF'
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
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Suite Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF46472C-28A2-4352-8699-D29597540B8D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tags',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '397883C9-1EF4-4110-990F-B2D20AB70EF8'
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
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DBDFAA6B-C4B1-4540-B301-CECDC1BFF1D5'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields that track record creation and modification"},"Test & Target Info":{"icon":"fa fa-bullseye","description":"Identifiers and descriptive fields linking the run to its test definition and execution target"},"Run Metadata":{"icon":"fa fa-clock","description":"Timing, status and sequencing information that describes how and when the test was executed"},"Input & Expected Output":{"icon":"fa fa-database","description":"JSON payloads representing inputs supplied to the test and the expected versus actual outputs"},"Result Analysis":{"icon":"fa fa-chart-line","description":"Validation metrics, scores, cost and diagnostic details produced by the test execution"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"System Metadata":"fa fa-cog","Test & Target Info":"fa fa-bullseye","Run Metadata":"fa fa-clock","Input & Expected Output":"fa fa-database","Result Analysis":"fa fa-chart-line"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 25 fields */
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
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tags',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2BFACAE1-586A-4682-BF69-D029EA451485'
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
       DisplayName = 'Total Duration (seconds)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8C6DEC81-DA98-4581-9735-67100444919B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Cost (USD)',
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

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Run Identification":{"icon":"fa fa-play-circle","description":"Key identifiers and context for the suite execution such as suite reference, trigger, environment, and version details"},"Execution Timeline & Status":{"icon":"fa fa-clock","description":"Lifecycle timestamps and current status of the suite run"},"Test Metrics":{"icon":"fa fa-chart-line","description":"Aggregated counts, durations, and cost information for the executed tests"},"Technical Output":{"icon":"fa fa-file-code","description":"Raw configuration, result JSON and any error messages generated by the run"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and primary identifier"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Run Identification":"fa fa-play-circle","Execution Timeline & Status":"fa fa-clock","Test Metrics":"fa fa-chart-line","Technical Output":"fa fa-file-code","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '61438D17-BE0C-4BFF-A1B3-C014279A3BA7' AND Name = 'FieldCategoryIcons'
            

