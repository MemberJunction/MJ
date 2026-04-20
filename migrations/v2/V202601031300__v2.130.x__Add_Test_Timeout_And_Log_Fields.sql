/**
 * Migration: Add Test Timeout and Log Fields
 * Version: 3.1.x
 *
 * This migration adds:
 * 1. 'Timeout' status value to TestRun.Status CHECK constraint
 * 2. MaxExecutionTimeMS column to Test table (per-test timeout)
 * 3. MaxExecutionTimeMS column to TestSuite table (per-suite timeout)
 * 4. Log column to TestRun table (execution log capture)
 *
 * These changes support proper timeout handling with cancellation in the testing framework.
 */
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
GO
----------------------------------------------------------------------
-- 1. Update TestRun.Status CHECK constraint to add 'Timeout' value
----------------------------------------------------------------------

-- Dynamically find and drop existing CHECK constraint on Status column
DECLARE @ConstraintName NVARCHAR(200);
DECLARE @SQL NVARCHAR(MAX);

SELECT @ConstraintName = cc.name
FROM sys.check_constraints cc
INNER JOIN sys.columns c ON cc.parent_object_id = c.object_id AND cc.parent_column_id = c.column_id
INNER JOIN sys.tables t ON cc.parent_object_id = t.object_id
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE t.name = 'TestRun'
  AND c.name = 'Status'
  AND s.name = '${flyway:defaultSchema}';

IF @ConstraintName IS NOT NULL
BEGIN
    SET @SQL = 'ALTER TABLE [${flyway:defaultSchema}].[TestRun] DROP CONSTRAINT [' + @ConstraintName + ']';
    EXEC sp_executesql @SQL;
END
GO

-- Add new CHECK constraint with 'Timeout' value included
ALTER TABLE [${flyway:defaultSchema}].[TestRun]
    ADD CONSTRAINT [CK_TestRun_Status]
    CHECK ([Status] IN ('Pending', 'Running', 'Passed', 'Failed', 'Skipped', 'Error', 'Timeout'));
GO

-- Update extended property for Status column to document new value
EXEC sys.sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the test run: Pending (queued), Running (in progress), Passed (all checks passed), Failed (at least one check failed), Skipped (not executed), Error (execution error before validation), Timeout (execution exceeded time limit and was cancelled)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'TestRun',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

----------------------------------------------------------------------
-- 2. Add MaxExecutionTimeMS column to Test table
----------------------------------------------------------------------

ALTER TABLE [${flyway:defaultSchema}].[Test]
    ADD [MaxExecutionTimeMS] INT NULL;
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum execution time in milliseconds for this test. If NULL, uses default (300000ms = 5 minutes). Can be overridden by Configuration JSON maxExecutionTime field for backward compatibility.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'Test',
    @level2type = N'COLUMN', @level2name = N'MaxExecutionTimeMS';
GO

----------------------------------------------------------------------
-- 3. Add MaxExecutionTimeMS column to TestSuite table
----------------------------------------------------------------------

ALTER TABLE [${flyway:defaultSchema}].[TestSuite]
    ADD [MaxExecutionTimeMS] INT NULL;
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum total execution time in milliseconds for the entire suite. If NULL, no suite-level timeout applies (individual test timeouts still apply). When exceeded, current test is cancelled and remaining tests are skipped.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'TestSuite',
    @level2type = N'COLUMN', @level2name = N'MaxExecutionTimeMS';
GO

----------------------------------------------------------------------
-- 4. Add Log column to TestRun table
----------------------------------------------------------------------

ALTER TABLE [${flyway:defaultSchema}].[TestRun]
    ADD [Log] NVARCHAR(MAX) NULL;
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed execution log capturing status messages, diagnostic output, and driver-specific information streamed during test execution. Format is timestamped log lines.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'TestRun',
    @level2type = N'COLUMN', @level2name = N'Log';
GO



















































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5f9949ef-8fa0-413a-8cde-858295f5fe10'  OR 
               (EntityID = '1F949AD0-8C72-4846-8A0B-0B3D9F644231' AND Name = 'MaxExecutionTimeMS')
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
            '5f9949ef-8fa0-413a-8cde-858295f5fe10',
            '1F949AD0-8C72-4846-8A0B-0B3D9F644231', -- Entity: MJ: Tests
            100032,
            'MaxExecutionTimeMS',
            'Max Execution Time MS',
            'Maximum execution time in milliseconds for this test. If NULL, uses default (300000ms = 5 minutes). Can be overridden by Configuration JSON maxExecutionTime field for backward compatibility.',
            'int',
            4,
            10,
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
         WHERE ID = 'a6755df4-8b80-4e06-9d3f-b02188db8a12'  OR 
               (EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'InheritTypeModalities')
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
            'a6755df4-8b80-4e06-9d3f-b02188db8a12',
            'FD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: AI Models
            100031,
            'InheritTypeModalities',
            'Inherit Type Modalities',
            'When TRUE (default), the model inherits default input/output modalities from its AIModelType AND can extend with additional modalities via AIModelModality records. When FALSE, only modalities explicitly defined in AIModelModality are used.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
         WHERE ID = '9c2dd641-f764-4c55-8527-fd5e37bd1895'  OR 
               (EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'PriorVersionID')
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
            '9c2dd641-f764-4c55-8527-fd5e37bd1895',
            'FD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: AI Models
            100032,
            'PriorVersionID',
            'Prior Version ID',
            'Reference to the previous version of this model, creating a version lineage chain. For example, GPT-4 Turbo might reference GPT-4 as its prior version.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'dbdfaa6b-c4b1-4540-b301-cecdc1bff1d5'  OR 
               (EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'Log')
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
            'dbdfaa6b-c4b1-4540-b301-cecdc1bff1d5',
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', -- Entity: MJ: Test Runs
            100050,
            'Log',
            'Log',
            'Detailed execution log capturing status messages, diagnostic output, and driver-specific information streamed during test execution. Format is timestamped log lines.',
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
         WHERE ID = 'b4447b72-fac9-465f-93f5-edd137e6b669'  OR 
               (EntityID = '8FC868B5-778D-4282-BBAB-91C01F863C83' AND Name = 'MaxExecutionTimeMS')
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
            'b4447b72-fac9-465f-93f5-edd137e6b669',
            '8FC868B5-778D-4282-BBAB-91C01F863C83', -- Entity: MJ: Test Suites
            100021,
            'MaxExecutionTimeMS',
            'Max Execution Time MS',
            'Maximum total execution time in milliseconds for the entire suite. If NULL, no suite-level timeout applies (individual test timeouts still apply). When exceeded, current test is cancelled and remaining tests are skipped.',
            'int',
            4,
            10,
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

/* SQL text to insert entity field value with ID 94c424e4-51c2-42f8-8dfe-a4e750845e1a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('94c424e4-51c2-42f8-8dfe-a4e750845e1a', '65595F32-31AA-4816-B077-9488CCFE677C', 7, 'Timeout', 'Timeout')

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '65ba09a6-62d5-474b-b27f-6ff09d9bcac0'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('65ba09a6-62d5-474b-b27f-6ff09d9bcac0', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'PriorVersionID', 'One To Many', 1, 1, 'AI Models', 20);
   END
                              

/* Index for Foreign Keys for AIModel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AIModelTypeID in table AIModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModel_AIModelTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModel_AIModelTypeID ON [${flyway:defaultSchema}].[AIModel] ([AIModelTypeID]);

-- Index for foreign key PriorVersionID in table AIModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModel_PriorVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModel_PriorVersionID ON [${flyway:defaultSchema}].[AIModel] ([PriorVersionID]);

/* Base View Permissions SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: Permissions for vwAIModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: spCreateAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModel]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @PowerRank int,
    @IsActive bit = NULL,
    @SpeedRank int,
    @CostRank int,
    @ModelSelectionInsights nvarchar(MAX),
    @InheritTypeModalities bit = NULL,
    @PriorVersionID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIModel]
            (
                [ID],
                [Name],
                [Description],
                [AIModelTypeID],
                [PowerRank],
                [IsActive],
                [SpeedRank],
                [CostRank],
                [ModelSelectionInsights],
                [InheritTypeModalities],
                [PriorVersionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @AIModelTypeID,
                @PowerRank,
                ISNULL(@IsActive, 1),
                @SpeedRank,
                @CostRank,
                @ModelSelectionInsights,
                ISNULL(@InheritTypeModalities, 1),
                @PriorVersionID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIModel]
            (
                [Name],
                [Description],
                [AIModelTypeID],
                [PowerRank],
                [IsActive],
                [SpeedRank],
                [CostRank],
                [ModelSelectionInsights],
                [InheritTypeModalities],
                [PriorVersionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @AIModelTypeID,
                @PowerRank,
                ISNULL(@IsActive, 1),
                @SpeedRank,
                @CostRank,
                @ModelSelectionInsights,
                ISNULL(@InheritTypeModalities, 1),
                @PriorVersionID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModel] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModel] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: spUpdateAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModel]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @PowerRank int,
    @IsActive bit,
    @SpeedRank int,
    @CostRank int,
    @ModelSelectionInsights nvarchar(MAX),
    @InheritTypeModalities bit,
    @PriorVersionID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModel]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [AIModelTypeID] = @AIModelTypeID,
        [PowerRank] = @PowerRank,
        [IsActive] = @IsActive,
        [SpeedRank] = @SpeedRank,
        [CostRank] = @CostRank,
        [ModelSelectionInsights] = @ModelSelectionInsights,
        [InheritTypeModalities] = @InheritTypeModalities,
        [PriorVersionID] = @PriorVersionID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIModels] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModel table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIModel]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIModel];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModel
ON [${flyway:defaultSchema}].[AIModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModel] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: spDeleteAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModel]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModel] TO [cdp_Developer]
    

/* spDelete Permissions for AI Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModel] TO [cdp_Developer]



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
    @Log nvarchar(MAX)
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
                [Log]
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
                @Log
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
                [Log]
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
                @Log
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
    @Log nvarchar(MAX)
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
        [Log] = @Log
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



/* Index for Foreign Keys for TestSuite */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table TestSuite
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestSuite_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestSuite]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestSuite_ParentID ON [${flyway:defaultSchema}].[TestSuite] ([ParentID]);

/* Root ID Function SQL for MJ: Test Suites.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: fnTestSuiteParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [TestSuite].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnTestSuiteParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnTestSuiteParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnTestSuiteParentID_GetRootID]
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
            [${flyway:defaultSchema}].[TestSuite]
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
            [${flyway:defaultSchema}].[TestSuite] c
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


/* Index for Foreign Keys for Test */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tests
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TypeID in table Test
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Test_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Test]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Test_TypeID ON [${flyway:defaultSchema}].[Test] ([TypeID]);

/* Base View SQL for MJ: Test Suites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: vwTestSuites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Suites
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestSuite
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestSuites]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestSuites];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestSuites]
AS
SELECT
    t.*,
    TestSuite_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[TestSuite] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[TestSuite] AS TestSuite_ParentID
  ON
    [t].[ParentID] = TestSuite_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnTestSuiteParentID_GetRootID]([t].[ID], [t].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestSuites] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Suites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: Permissions for vwTestSuites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestSuites] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Suites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: spCreateTestSuite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestSuite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestSuite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestSuite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestSuite]
    @ID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @Tags nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @MaxExecutionTimeMS int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestSuite]
            (
                [ID],
                [ParentID],
                [Name],
                [Description],
                [Status],
                [Tags],
                [Configuration],
                [MaxExecutionTimeMS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ParentID,
                @Name,
                @Description,
                ISNULL(@Status, 'Active'),
                @Tags,
                @Configuration,
                @MaxExecutionTimeMS
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestSuite]
            (
                [ParentID],
                [Name],
                [Description],
                [Status],
                [Tags],
                [Configuration],
                [MaxExecutionTimeMS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ParentID,
                @Name,
                @Description,
                ISNULL(@Status, 'Active'),
                @Tags,
                @Configuration,
                @MaxExecutionTimeMS
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestSuites] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestSuite] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Suites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestSuite] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Suites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: spUpdateTestSuite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestSuite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestSuite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestSuite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestSuite]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @Tags nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @MaxExecutionTimeMS int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestSuite]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status,
        [Tags] = @Tags,
        [Configuration] = @Configuration,
        [MaxExecutionTimeMS] = @MaxExecutionTimeMS
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestSuites] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestSuites]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestSuite] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestSuite table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestSuite]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestSuite];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestSuite
ON [${flyway:defaultSchema}].[TestSuite]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestSuite]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestSuite] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Suites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestSuite] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Suites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: spDeleteTestSuite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestSuite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestSuite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestSuite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestSuite]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestSuite]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestSuite] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Suites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestSuite] TO [cdp_Integration]



/* Base View SQL for MJ: Tests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tests
-- Item: vwTests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tests
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Test
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTests]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTests];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTests]
AS
SELECT
    t.*,
    TestType_TypeID.[Name] AS [Type]
FROM
    [${flyway:defaultSchema}].[Test] AS t
INNER JOIN
    [${flyway:defaultSchema}].[TestType] AS TestType_TypeID
  ON
    [t].[TypeID] = TestType_TypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTests] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Tests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tests
-- Item: Permissions for vwTests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTests] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Tests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tests
-- Item: spCreateTest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Test
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTest]
    @ID uniqueidentifier = NULL,
    @TypeID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @InputDefinition nvarchar(MAX),
    @ExpectedOutcomes nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Tags nvarchar(MAX),
    @Priority int,
    @EstimatedDurationSeconds int,
    @EstimatedCostUSD decimal(10, 6),
    @RepeatCount int,
    @MaxExecutionTimeMS int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Test]
            (
                [ID],
                [TypeID],
                [Name],
                [Description],
                [Status],
                [InputDefinition],
                [ExpectedOutcomes],
                [Configuration],
                [Tags],
                [Priority],
                [EstimatedDurationSeconds],
                [EstimatedCostUSD],
                [RepeatCount],
                [MaxExecutionTimeMS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TypeID,
                @Name,
                @Description,
                ISNULL(@Status, 'Active'),
                @InputDefinition,
                @ExpectedOutcomes,
                @Configuration,
                @Tags,
                @Priority,
                @EstimatedDurationSeconds,
                @EstimatedCostUSD,
                @RepeatCount,
                @MaxExecutionTimeMS
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Test]
            (
                [TypeID],
                [Name],
                [Description],
                [Status],
                [InputDefinition],
                [ExpectedOutcomes],
                [Configuration],
                [Tags],
                [Priority],
                [EstimatedDurationSeconds],
                [EstimatedCostUSD],
                [RepeatCount],
                [MaxExecutionTimeMS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TypeID,
                @Name,
                @Description,
                ISNULL(@Status, 'Active'),
                @InputDefinition,
                @ExpectedOutcomes,
                @Configuration,
                @Tags,
                @Priority,
                @EstimatedDurationSeconds,
                @EstimatedCostUSD,
                @RepeatCount,
                @MaxExecutionTimeMS
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTests] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTest] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Tests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTest] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Tests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tests
-- Item: spUpdateTest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Test
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTest]
    @ID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @InputDefinition nvarchar(MAX),
    @ExpectedOutcomes nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Tags nvarchar(MAX),
    @Priority int,
    @EstimatedDurationSeconds int,
    @EstimatedCostUSD decimal(10, 6),
    @RepeatCount int,
    @MaxExecutionTimeMS int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Test]
    SET
        [TypeID] = @TypeID,
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status,
        [InputDefinition] = @InputDefinition,
        [ExpectedOutcomes] = @ExpectedOutcomes,
        [Configuration] = @Configuration,
        [Tags] = @Tags,
        [Priority] = @Priority,
        [EstimatedDurationSeconds] = @EstimatedDurationSeconds,
        [EstimatedCostUSD] = @EstimatedCostUSD,
        [RepeatCount] = @RepeatCount,
        [MaxExecutionTimeMS] = @MaxExecutionTimeMS
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTests] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTests]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTest] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Test table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTest]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTest];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTest
ON [${flyway:defaultSchema}].[Test]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Test]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Test] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTest] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Tests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tests
-- Item: spDeleteTest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Test
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Test]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTest] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Tests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTest] TO [cdp_Integration]



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3F0A0E85-2F76-4CEF-B11B-82D68BE3C7DC'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3F0A0E85-2F76-4CEF-B11B-82D68BE3C7DC'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '94340107-B647-483D-A377-F6AE1B69E9CC'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3E9E16F5-3120-450B-B3FD-041C1AEA446D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4565473C-1E86-4D73-AC1E-5ED369EE0822'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '15569044-4E7C-4722-B2D6-47D201042E84'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BE67FEF8-9AE8-4BEB-A724-8AFEB9732DC3'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3F0A0E85-2F76-4CEF-B11B-82D68BE3C7DC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '099D18DA-CFFF-45FF-9AB6-96E53D0AC763'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '94340107-B647-483D-A377-F6AE1B69E9CC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BCA40242-8377-4EC4-B963-0683F608DE81'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BE67FEF8-9AE8-4BEB-A724-8AFEB9732DC3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'AA8C0F3C-23F3-4FE7-974A-B271DAFF4F85'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AA8C0F3C-23F3-4FE7-974A-B271DAFF4F85'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B8EFF617-B600-41B9-BA4E-6F7232AEA721'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C44C8672-8FFA-4FC8-94C0-E0B2B66FF9F3'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AA8C0F3C-23F3-4FE7-974A-B271DAFF4F85'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B8EFF617-B600-41B9-BA4E-6F7232AEA721'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C44C8672-8FFA-4FC8-94C0-E0B2B66FF9F3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '855D6B18-2272-4263-95D9-2EDF7F00B60D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'FA4217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FA4217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '064317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AF5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '014317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FA4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AF5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '014317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FC4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '274F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

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
            

/* Set categories for 17 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA709873-2485-4DF4-9CE4-B9156F0A6930'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EC7184C8-1675-4834-8FFB-17051DFA19A9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3F0A0E85-2F76-4CEF-B11B-82D68BE3C7DC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '099D18DA-CFFF-45FF-9AB6-96E53D0AC763'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '94340107-B647-483D-A377-F6AE1B69E9CC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Type Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BE67FEF8-9AE8-4BEB-A724-8AFEB9732DC3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Logic',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Definition',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '10497D13-07A5-4378-B333-BA1C7E6310BC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Logic',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expected Outcomes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '03201FF5-0D92-49C0-96C2-DA387D455CAC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Logic',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CE8574A1-32DD-4485-9EA1-EA23A6A974FA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tags',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BCA40242-8377-4EC4-B963-0683F608DE81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E9E16F5-3120-450B-B3FD-041C1AEA446D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Estimated Duration (seconds)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4565473C-1E86-4D73-AC1E-5ED369EE0822'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Estimated Cost (USD)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '15569044-4E7C-4722-B2D6-47D201042E84'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Repeat Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '152CBD8B-04B0-4FF4-9FE1-EDAEBF4A11A4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Execution Time (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5F9949EF-8FA0-413A-8CDE-858295F5FE10'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D67C05C2-D342-4182-A655-EE8AE8DDA9D8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '071B36B5-96D6-4C88-A416-BDC0B0E7689B'
   AND AutoUpdateCategory = 1

/* Set categories for 12 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Suite Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA8C0F3C-23F3-4FE7-974A-B271DAFF4F85'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Suite Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B8EFF617-B600-41B9-BA4E-6F7232AEA721'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Suite Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C44C8672-8FFA-4FC8-94C0-E0B2B66FF9F3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tags',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '855D6B18-2272-4263-95D9-2EDF7F00B60D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C24FF84-3CFE-4283-B69E-BA71BDE47E00'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '00592921-D850-4456-8B2F-FE89A6C15C57'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '97CE5A5D-551F-4EE9-A8C8-6F07BDDCBC78'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '56F4B4F1-3FA2-4EC4-9AD7-D30547CEA314'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Execution Time (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B4447B72-FAC9-465F-93F5-EDD137E6B669'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A78D3A9-915E-46CE-A059-30D66035AF3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '34B7E9D4-849A-41DF-A051-1D0E9FA725B8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '97A83FB1-3BBE-47D8-9C85-2CADEFCF3033'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('52d0ce19-07ca-48f1-91ee-b51e69ac4665', '1F949AD0-8C72-4846-8A0B-0B3D9F644231', 'FieldCategoryInfo', '{"Test Definition":{"icon":"fa fa-file-alt","description":""},"Test Logic":{"icon":"fa fa-code","description":""},"Execution Settings":{"icon":"fa fa-sliders-h","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Set entity icon to fa fa-flask */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-flask',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '8FC868B5-778D-4282-BBAB-91C01F863C83'
               

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Test Definition":"fa fa-file-alt","Test Logic":"fa fa-code","Execution Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '1F949AD0-8C72-4846-8A0B-0B3D9F644231' AND Name = 'FieldCategoryIcons'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('02464033-83ce-4e5d-bfe0-233ea137dd64', '8FC868B5-778D-4282-BBAB-91C01F863C83', 'FieldCategoryInfo', '{"Suite Identification":{"icon":"fa fa-list-alt","description":"Core descriptive attributes of the test suite such as name, description, and status"},"Hierarchy":{"icon":"fa fa-sitemap","description":"Fields that define the suite''s position within a hierarchical structure"},"Execution Configuration":{"icon":"fa fa-sliders-h","description":"Settings that control how the suite is executed, including configuration JSON, time limits, and tags"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields tracking creation and modification timestamps and the primary identifier"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6c486c81-365f-43bd-8978-040fad7757a6', '8FC868B5-778D-4282-BBAB-91C01F863C83', 'FieldCategoryIcons', '{"Suite Identification":"fa fa-list-alt","Hierarchy":"fa fa-sitemap","Execution Configuration":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set categories for 27 fields */
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
       DisplayName = 'Test Suite Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF46472C-28A2-4352-8699-D29597540B8D'
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
       DisplayName = 'Duration Seconds',
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
            

/* Set categories for 21 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F94217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FB4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Model Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '024317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '064317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model Selection Insights',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '309321B0-2443-47A1-85E6-A134664B4AAB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Model Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '014317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inherit Type Modalities',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A6755DF4-8B80-4E06-9D3F-B02188DB8A12'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prior Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C2DD641-F764-4C55-8527-FD5E37BD1895'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Power Rank',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '284F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Speed Rank',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B8E8CA9-7728-455A-A528-0F13782242C0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cost Rank',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2ED7BE95-4E39-439B-8152-D0A6516C1398'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AE5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Specifications',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Specifications',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Import Path',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '094317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Specifications',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '274F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Specifications',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Token Limit',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5EC9D425-B9DA-4FED-ACC9-596859658679'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Specifications',
       GeneratedFormSection = 'Category',
       DisplayName = 'Supported Response Formats',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B0575EC-3B6E-4F64-B9AC-052B44127021'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Specifications',
       GeneratedFormSection = 'Category',
       DisplayName = 'Supports Effort Level',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A7850674-D31F-4669-8F25-30D9F581E873'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3b25970c-7076-479d-98f2-35541542a3cd', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Model Overview":{"icon":"fa fa-info-circle","description":""},"Performance Metrics":{"icon":"fa fa-tachometer-alt","description":""},"Technical Specifications":{"icon":"fa fa-cog","description":""},"System Metadata":{"icon":"fa fa-database","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Model Overview":"fa fa-info-circle","Performance Metrics":"fa fa-tachometer-alt","Technical Specifications":"fa fa-cog","System Metadata":"fa fa-database"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

