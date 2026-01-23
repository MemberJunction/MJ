/**
 * Migration: Add TargetLogEntityID to TestRun
 *
 * This migration adds a proper foreign key reference to the Entity table for TestRun's
 * polymorphic target linkage. Previously, TargetType was a free-text field used to identify
 * the entity type. Now we have a proper FK to Entity.ID.
 *
 * Changes:
 * 1. Add TargetLogEntityID column as nullable FK to Entity.ID
 * 2. Update TargetType description to indicate it's now for sub-categorization
 */

-- Ensure metadata is in sync from previous migrations
EXEC [${flyway:defaultSchema}].spRecompileAllViews

EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'
GO
-- ============================================================================
-- DDL OPERATIONS
-- ============================================================================

-- Add TargetLogEntityID column with foreign key to Entity
ALTER TABLE ${flyway:defaultSchema}.TestRun
    ADD TargetLogEntityID UNIQUEIDENTIFIER NULL
    CONSTRAINT FK_TestRun_TargetLogEntityID FOREIGN KEY
    REFERENCES ${flyway:defaultSchema}.Entity(ID);
GO

-- ============================================================================
-- EXTENDED PROPERTIES
-- ============================================================================

-- Add description for new TargetLogEntityID column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to Entity table identifying the type of entity referenced by TargetLogID. When populated, TargetLogID is a record ID in this entity. Used for linking test runs to AI Agent Runs, Workflow Runs, or other entity types being tested.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestRun',
    @level2type = N'COLUMN', @level2name = 'TargetLogEntityID';
GO

-- Drop existing extended property for TargetType
IF EXISTS (SELECT * FROM sys.extended_properties
           WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.TestRun')
           AND minor_id = (SELECT column_id FROM sys.columns
                          WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.TestRun')
                          AND name = 'TargetType')
           AND name = 'MS_Description')
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = 'TestRun',
        @level2type = N'COLUMN', @level2name = 'TargetType';
END
GO

-- Update TargetType description to clarify its new purpose as sub-categorization
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional sub-category or variant label for the test target. Use this to distinguish between different test scenarios within the same entity type (e.g., "Summarization", "Classification", "Code Review" for AI Agent tests). The entity type itself should be specified via TargetLogEntityID.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestRun',
    @level2type = N'COLUMN', @level2name = 'TargetType';
GO


-- Migrate existing TestRun records with TargetType='AI Agent' to use TargetLogEntityID
-- This updates records to use the proper Entity FK instead of the free-text TargetType

UPDATE tr
SET TargetLogEntityID = e.ID
FROM ${flyway:defaultSchema}.TestRun tr
INNER JOIN ${flyway:defaultSchema}.Entity e ON e.Name = 'MJ: AI Agent Runs'
WHERE tr.TargetType = 'AI Agent'
  AND tr.TargetLogEntityID IS NULL;
 































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fd5ffce1-e99e-4576-af03-0f35b7236280'  OR 
               (EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'TargetLogEntityID')
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
            'fd5ffce1-e99e-4576-af03-0f35b7236280',
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', -- Entity: MJ: Test Runs
            100064,
            'TargetLogEntityID',
            'Target Log Entity ID',
            'Foreign key to Entity table identifying the type of entity referenced by TargetLogID. When populated, TargetLogID is a record ID in this entity. Used for linking test runs to AI Agent Runs, Workflow Runs, or other entity types being tested.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '24a4cd17-b7e8-4500-a5da-6c0b0e35a590'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('24a4cd17-b7e8-4500-a5da-6c0b0e35a590', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', 'TargetLogEntityID', 'One To Many', 1, 1, 'MJ: Test Runs', 6);
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

-- Index for foreign key TargetLogEntityID in table TestRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRun_TargetLogEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRun_TargetLogEntityID ON [${flyway:defaultSchema}].[TestRun] ([TargetLogEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID FD5FFCE1-E99E-4576-AF03-0F35B7236280 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FD5FFCE1-E99E-4576-AF03-0F35B7236280',
         @RelatedEntityNameFieldMap='TargetLogEntity'

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
    User_RunByUserID.[Name] AS [RunByUser],
    Entity_TargetLogEntityID.[Name] AS [TargetLogEntity]
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_TargetLogEntityID
  ON
    [t].[TargetLogEntityID] = Entity_TargetLogEntityID.[ID]
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
    @Tags nvarchar(MAX),
    @MachineName nvarchar(255),
    @MachineID nvarchar(255),
    @RunByUserName nvarchar(255),
    @RunByUserEmail nvarchar(255),
    @RunContextDetails nvarchar(MAX),
    @TargetLogEntityID uniqueidentifier
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
                [Tags],
                [MachineName],
                [MachineID],
                [RunByUserName],
                [RunByUserEmail],
                [RunContextDetails],
                [TargetLogEntityID]
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
                @Tags,
                @MachineName,
                @MachineID,
                @RunByUserName,
                @RunByUserEmail,
                @RunContextDetails,
                @TargetLogEntityID
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
                [Tags],
                [MachineName],
                [MachineID],
                [RunByUserName],
                [RunByUserEmail],
                [RunContextDetails],
                [TargetLogEntityID]
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
                @Tags,
                @MachineName,
                @MachineID,
                @RunByUserName,
                @RunByUserEmail,
                @RunContextDetails,
                @TargetLogEntityID
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
    @Tags nvarchar(MAX),
    @MachineName nvarchar(255),
    @MachineID nvarchar(255),
    @RunByUserName nvarchar(255),
    @RunByUserEmail nvarchar(255),
    @RunContextDetails nvarchar(MAX),
    @TargetLogEntityID uniqueidentifier
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
        [Tags] = @Tags,
        [MachineName] = @MachineName,
        [MachineID] = @MachineID,
        [RunByUserName] = @RunByUserName,
        [RunByUserEmail] = @RunByUserEmail,
        [RunContextDetails] = @RunContextDetails,
        [TargetLogEntityID] = @TargetLogEntityID
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



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c97b9968-a9ba-4341-8f8a-23e1b7fb9f1c'  OR 
               (EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'TargetLogEntity')
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
            'c97b9968-a9ba-4341-8f8a-23e1b7fb9f1c',
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', -- Entity: MJ: Test Runs
            100069,
            'TargetLogEntity',
            'Target Log Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
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
            WHERE ID = 'FC65C4D6-DF53-4ADF-8E89-52D8758E1FC0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5BDC96C5-0413-443A-ABF8-77650EBFD284'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '685B3477-69E7-49C9-BDE2-BE09D15BF115'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '96A90EF2-FD85-45EB-880B-A5A129DFDDFF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '685B3477-69E7-49C9-BDE2-BE09D15BF115'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F0098B66-6B25-4CDB-8737-88238597A2D9'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A013BC92-EC61-447E-9731-9BEFCABB2CB1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 35 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '198553FB-E3EB-44EA-9B0F-9255D20A837A'
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
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Suite Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '474B4535-FEF5-4F52-AB4B-0FF00D355F81'
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
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '088A8796-A0C6-4EDE-82E9-8E0BF053423F'
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
       DisplayName = 'Cost USD',
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
   SET Category = 'Result Analysis',
       GeneratedFormSection = 'Category',
       DisplayName = 'Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DBDFAA6B-C4B1-4540-B301-CECDC1BFF1D5'
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
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Machine Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BD83BC2C-B532-4869-BB34-AE35A7A7FF1A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Machine ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CC0F088A-8B90-4B4C-AFA9-7C1A3E03B959'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run Context Details',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA2957EE-1AF9-4A48-863B-856FCE0CFE60'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '685B3477-69E7-49C9-BDE2-BE09D15BF115'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run By User Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = 'F0098B66-6B25-4CDB-8737-88238597A2D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test & Target Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target Log Entity ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD5FFCE1-E99E-4576-AF03-0F35B7236280'
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
   SET Category = 'Run Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Suite Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF46472C-28A2-4352-8699-D29597540B8D'
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
       DisplayName = 'Target Log Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C97B9968-A9BA-4341-8F8A-23E1B7FB9F1C'
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
            

