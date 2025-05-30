-- ==========================================================
-- Entity:      AI Models
-- EntityID:    FD238F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwAIModels
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 4
  WHERE ID       = '024317F0-6F36-EF11-86D4-6045BDEE16E6'; -- AIModelTypeID
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 5
  WHERE ID       = '284F17F0-6F36-EF11-86D4-6045BDEE16E6'; -- PowerRank
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 6
  WHERE ID       = '064317F0-6F36-EF11-86D4-6045BDEE16E6'; -- IsActive
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 7
  WHERE ID       = 'AD5817F0-6F36-EF11-86D4-6045BDEE16E6'; -- [${flyway:defaultSchema}]_CreatedAt
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 8
  WHERE ID       = 'AE5817F0-6F36-EF11-86D4-6045BDEE16E6'; -- [${flyway:defaultSchema}]_UpdatedAt
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 9
  WHERE ID       = '5B8E8CA9-7728-455A-A528-0F13782242C0'; -- SpeedRank
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 10
  WHERE ID       = '2ED7BE95-4E39-439B-8152-D0A6516C1398'; -- CostRank
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 11
  WHERE ID       = '309321B0-2443-47A1-85E6-A134664B4AAB'; -- ModelSelectionInsights
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 12
  WHERE ID       = 'AF5817F0-6F36-EF11-86D4-6045BDEE16E6'; -- AIModelType
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 13
  WHERE ID       = '014317F0-6F36-EF11-86D4-6045BDEE16E6'; -- Vendor
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 14
  WHERE ID       = 'FC4217F0-6F36-EF11-86D4-6045BDEE16E6'; -- DriverClass
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 15
  WHERE ID       = '094317F0-6F36-EF11-86D4-6045BDEE16E6'; -- DriverImportPath
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 16
  WHERE ID       = '274F17F0-6F36-EF11-86D4-6045BDEE16E6'; -- APIName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 17
  WHERE ID       = '5EC9D425-B9DA-4FED-ACC9-596859658679'; -- InputTokenLimit
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 18
  WHERE ID       = '8B0575EC-3B6E-4F64-B9AC-052B44127021'; -- SupportedResponseFormats
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 19
  WHERE ID       = 'A7850674-D31F-4669-8F25-30D9F581E873'; -- SupportsEffortLevel

-- ==========================================================
-- Entity:      AI Prompts
-- EntityID:    73AD0238-8B56-EF11-991A-6045BDEBA539
-- BaseView:    [${flyway:defaultSchema}].vwAIPrompts
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 8
  WHERE ID       = 'F873433E-F36B-1410-883E-00D02208DC50'; -- [${flyway:defaultSchema}]_CreatedAt
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 9
  WHERE ID       = 'F973433E-F36B-1410-883E-00D02208DC50'; -- [${flyway:defaultSchema}]_UpdatedAt
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 10
  WHERE ID       = '4EBEB02B-AC46-4440-948F-0FCD6C6C26DE'; -- ResponseFormat
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 11
  WHERE ID       = 'DAC94188-E300-4AF8-9CD1-7ED8AFF561BF'; -- ModelSpecificResponseFormat
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 34
  WHERE ID       = '8B74433E-F36B-1410-883E-00D02208DC50'; -- Template
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 35
  WHERE ID       = '8F74433E-F36B-1410-883E-00D02208DC50'; -- Category
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 36
  WHERE ID       = '9374433E-F36B-1410-883E-00D02208DC50'; -- Type

-- ==========================================================
-- Entity:      AI Result Cache
-- EntityID:    78AD0238-8B56-EF11-991A-6045BDEBA539
-- BaseView:    [${flyway:defaultSchema}].vwAIResultCaches
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 16
  WHERE ID       = '9774433E-F36B-1410-883E-00D02208DC50'; -- AIPrompt
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 17
  WHERE ID       = '9B74433E-F36B-1410-883E-00D02208DC50'; -- AIModel

-- ==========================================================
-- Entity:      Audit Logs
-- EntityID:    F8238F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwAuditLogs
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 15
  WHERE ID       = 'FE4E17F0-6F36-EF11-86D4-6045BDEE16E6'; -- Entity

-- ==========================================================
-- Entity:      Conversation Details
-- EntityID:    12248F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwConversationDetails
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 18
  WHERE ID       = '6D4317F0-6F36-EF11-86D4-6045BDEE16E6'; -- Conversation
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 19
  WHERE ID       = '50D773C6-6E9F-4C00-AAE3-A284ABE38676'; -- User
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 20
  WHERE ID       = 'D350E5F8-8128-4A32-851E-BA6A227E4D5C'; -- Artifact

-- ==========================================================
-- Entity:      Conversations
-- EntityID:    13248F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwConversations
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 14
  WHERE ID       = '6E4317F0-6F36-EF11-86D4-6045BDEE16E6'; -- User
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 15
  WHERE ID       = '834E17F0-6F36-EF11-86D4-6045BDEE16E6'; -- LinkedEntity
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 16
  WHERE ID       = '1AE26D76-2246-4FD4-8BCB-04C1953E2612'; -- DataContext

-- ==========================================================
-- Entity:      Dashboards
-- EntityID:    05248F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwDashboards
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 13
  WHERE ID       = '42DE7B62-C988-451F-8A65-7A2B26B66067'; -- DriverClass
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 14
  WHERE ID       = 'C730A4D6-7966-4EB8-836F-29EECDEAB11B'; -- Code
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 15
  WHERE ID       = '5B4E17F0-6F36-EF11-86D4-6045BDEE16E6'; -- User
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 16
  WHERE ID       = '0E4417F0-6F36-EF11-86D4-6045BDEE16E6'; -- Category
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 17
  WHERE ID       = '401ED2BA-9FEE-4D6E-876A-21CA9A8EAD0E'; -- Application

-- ==========================================================
-- Entity:      Data Context Items
-- EntityID:    23248F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwDataContextItems
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 14
  WHERE ID       = 'FD4317F0-6F36-EF11-86D4-6045BDEE16E6'; -- DataContext
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 15
  WHERE ID       = '024417F0-6F36-EF11-86D4-6045BDEE16E6'; -- View
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 16
  WHERE ID       = '034417F0-6F36-EF11-86D4-6045BDEE16E6'; -- Query
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 17
  WHERE ID       = '034F17F0-6F36-EF11-86D4-6045BDEE16E6'; -- Entity

-- ==========================================================
-- Entity:      Dataset Items
-- EntityID:    11248F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwDatasetItems
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 13
  WHERE ID       = '6C4317F0-6F36-EF11-86D4-6045BDEE16E6'; -- Entity

-- ==========================================================
-- Entity:      Entities
-- EntityID:    E0238F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwEntities
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 57
  WHERE ID       = 'AA4217F0-6F36-EF11-86D4-6045BDEE16E6'; -- CodeName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 58
  WHERE ID       = 'AB4217F0-6F36-EF11-86D4-6045BDEE16E6'; -- ClassName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 59
  WHERE ID       = 'AC4217F0-6F36-EF11-86D4-6045BDEE16E6'; -- BaseTableCodeName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 60
  WHERE ID       = '1D5817F0-6F36-EF11-86D4-6045BDEE16E6'; -- ParentEntity
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 61
  WHERE ID       = '1E5817F0-6F36-EF11-86D4-6045BDEE16E6'; -- ParentBaseTable
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 62
  WHERE ID       = '1F5817F0-6F36-EF11-86D4-6045BDEE16E6'; -- ParentBaseView

-- ==========================================================
-- Entity:      Entity Fields
-- EntityID:    DF238F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwEntityFields
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 45
  WHERE ID       = '07AD23D5-DEBD-4657-8E3C-7F1F1342BCE3'; -- FieldCodeName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 46
  WHERE ID       = '584D17F0-6F36-EF11-86D4-6045BDEE16E6'; -- Entity
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 47
  WHERE ID       = 'BA4217F0-6F36-EF11-86D4-6045BDEE16E6'; -- SchemaName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 48
  WHERE ID       = '594D17F0-6F36-EF11-86D4-6045BDEE16E6'; -- BaseTable
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 49
  WHERE ID       = '5A4D17F0-6F36-EF11-86D4-6045BDEE16E6'; -- BaseView
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 50
  WHERE ID       = 'A04D17F0-6F36-EF11-86D4-6045BDEE16E6'; -- EntityCodeName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 51
  WHERE ID       = 'B94217F0-6F36-EF11-86D4-6045BDEE16E6'; -- EntityClassName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 52
  WHERE ID       = 'B84217F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntity
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 53
  WHERE ID       = '9B4D17F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntitySchemaName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 54
  WHERE ID       = '9C4D17F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntityBaseTable
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 55
  WHERE ID       = '9D4D17F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntityBaseView
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 56
  WHERE ID       = '9E4D17F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntityCodeName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 57
  WHERE ID       = '9F4D17F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntityClassName

-- ==========================================================
-- Entity:      Entity Relationships
-- EntityID:    E2238F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwEntityRelationships
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 24
  WHERE ID       = '205817F0-6F36-EF11-86D4-6045BDEE16E6'; -- Entity
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 25
  WHERE ID       = '215817F0-6F36-EF11-86D4-6045BDEE16E6'; -- EntityBaseTable
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 26
  WHERE ID       = '225817F0-6F36-EF11-86D4-6045BDEE16E6'; -- EntityBaseView
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 27
  WHERE ID       = '235817F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntity
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 28
  WHERE ID       = '245817F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntityBaseTable
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 29
  WHERE ID       = '255817F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntityBaseView
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 30
  WHERE ID       = 'BB4217F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntityClassName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 31
  WHERE ID       = 'BC4217F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntityCodeName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 32
  WHERE ID       = 'BD4217F0-6F36-EF11-86D4-6045BDEE16E6'; -- RelatedEntityBaseTableCodeName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 33
  WHERE ID       = '3D4E17F0-6F36-EF11-86D4-6045BDEE16E6'; -- DisplayUserViewName

-- ==========================================================
-- Entity:      List Details
-- EntityID:    EF238F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwListDetails
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 9
  WHERE ID       = '575817F0-6F36-EF11-86D4-6045BDEE16E6'; -- List

-- ==========================================================
-- Entity:      Reports
-- EntityID:    09248F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwReports
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 20
  WHERE ID       = 'E9A8FEEC-7840-EF11-86C3-00224821D189'; -- Category
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 21
  WHERE ID       = 'EAA8FEEC-7840-EF11-86C3-00224821D189'; -- User
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 22
  WHERE ID       = 'EBA8FEEC-7840-EF11-86C3-00224821D189'; -- Conversation
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 23
  WHERE ID       = 'ECA8FEEC-7840-EF11-86C3-00224821D189'; -- DataContext
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 24
  WHERE ID       = 'EDA8FEEC-7840-EF11-86C3-00224821D189'; -- OutputTriggerType
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 25
  WHERE ID       = 'EEA8FEEC-7840-EF11-86C3-00224821D189'; -- OutputFormatType
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 26
  WHERE ID       = 'EFA8FEEC-7840-EF11-86C3-00224821D189'; -- OutputDeliveryType
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 27
  WHERE ID       = 'F0A8FEEC-7840-EF11-86C3-00224821D189'; -- OutputWorkflow

-- ==========================================================
-- Entity:      Template Params
-- EntityID:    4B248F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwTemplateParams
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 16
  WHERE ID       = 'D74C17F0-6F36-EF11-86D4-6045BDEE16E6'; -- Template
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 17
  WHERE ID       = 'D84C17F0-6F36-EF11-86D4-6045BDEE16E6'; -- Entity

-- ==========================================================
-- Entity:      User View Categories
-- EntityID:    25248F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwUserViewCategories
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 11
  WHERE ID       = 'D05817F0-6F36-EF11-86D4-6045BDEE16E6'; -- User

-- ==========================================================
-- Entity:      User Views
-- EntityID:    E4238F34-2837-EF11-86D4-6045BDEE16E6
-- BaseView:    [${flyway:defaultSchema}].vwUserViews
-- Fixing Sequence to match view column ORDINAL_POSITION
-- ==========================================================
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 22
  WHERE ID       = '264E17F0-6F36-EF11-86D4-6045BDEE16E6'; -- UserName
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 23
  WHERE ID       = '274E17F0-6F36-EF11-86D4-6045BDEE16E6'; -- UserFirstLast
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 24
  WHERE ID       = '284E17F0-6F36-EF11-86D4-6045BDEE16E6'; -- UserEmail
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 25
  WHERE ID       = '294E17F0-6F36-EF11-86D4-6045BDEE16E6'; -- UserType
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 26
  WHERE ID       = '2A4E17F0-6F36-EF11-86D4-6045BDEE16E6'; -- Entity
UPDATE [${flyway:defaultSchema}].[EntityField]
  SET Sequence = 27
  WHERE ID       = '2B4E17F0-6F36-EF11-86D4-6045BDEE16E6'; -- EntityBaseView


/** CODE GEN OUTPUT **/


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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModel]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @PowerRank int,
    @IsActive bit,
    @SpeedRank int,
    @CostRank int,
    @ModelSelectionInsights nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIModel]
        (
            [Name],
            [Description],
            [AIModelTypeID],
            [PowerRank],
            [IsActive],
            [SpeedRank],
            [CostRank],
            [ModelSelectionInsights]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @AIModelTypeID,
            @PowerRank,
            @IsActive,
            @SpeedRank,
            @CostRank,
            @ModelSelectionInsights
        )
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIModel]
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
    @ModelSelectionInsights nvarchar(MAX)
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
        [ModelSelectionInsights] = @ModelSelectionInsights
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
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
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIModel
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIModel]
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


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModel] TO [cdp_Developer]
    

/* spDelete Permissions for AI Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModel] TO [cdp_Developer]


/* Index for Foreign Keys for AIPrompt */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TemplateID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_TemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_TemplateID ON [${flyway:defaultSchema}].[AIPrompt] ([TemplateID]);

-- Index for foreign key CategoryID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_CategoryID ON [${flyway:defaultSchema}].[AIPrompt] ([CategoryID]);

-- Index for foreign key TypeID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_TypeID ON [${flyway:defaultSchema}].[AIPrompt] ([TypeID]);

-- Index for foreign key AIModelTypeID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_AIModelTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_AIModelTypeID ON [${flyway:defaultSchema}].[AIPrompt] ([AIModelTypeID]);

-- Index for foreign key ResultSelectorPromptID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_ResultSelectorPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_ResultSelectorPromptID ON [${flyway:defaultSchema}].[AIPrompt] ([ResultSelectorPromptID]);

/* Index for Foreign Keys for AIResultCache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AIPromptID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_AIPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_AIPromptID ON [${flyway:defaultSchema}].[AIResultCache] ([AIPromptID]);

-- Index for foreign key AIModelID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_AIModelID ON [${flyway:defaultSchema}].[AIResultCache] ([AIModelID]);

-- Index for foreign key VendorID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_VendorID ON [${flyway:defaultSchema}].[AIResultCache] ([VendorID]);

-- Index for foreign key AgentID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_AgentID ON [${flyway:defaultSchema}].[AIResultCache] ([AgentID]);

-- Index for foreign key ConfigurationID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_ConfigurationID ON [${flyway:defaultSchema}].[AIResultCache] ([ConfigurationID]);

-- Index for foreign key PromptRunID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_PromptRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_PromptRunID ON [${flyway:defaultSchema}].[AIResultCache] ([PromptRunID]);

/* Base View SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Prompts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIPrompts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPrompts]
AS
SELECT
    a.*,
    Template_TemplateID.[Name] AS [Template],
    AIPromptCategory_CategoryID.[Name] AS [Category],
    AIPromptType_TypeID.[Name] AS [Type],
    AIModelType_AIModelTypeID.[Name] AS [AIModelType],
    AIPrompt_ResultSelectorPromptID.[Name] AS [ResultSelectorPrompt]
FROM
    [${flyway:defaultSchema}].[AIPrompt] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_TemplateID
  ON
    [a].[TemplateID] = Template_TemplateID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptCategory] AS AIPromptCategory_CategoryID
  ON
    [a].[CategoryID] = AIPromptCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptType] AS AIPromptType_TypeID
  ON
    [a].[TypeID] = AIPromptType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModelType] AS AIModelType_AIModelTypeID
  ON
    [a].[AIModelTypeID] = AIModelType_AIModelTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ResultSelectorPromptID
  ON
    [a].[ResultSelectorPromptID] = AIPrompt_ResultSelectorPromptID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: Permissions for vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spCreateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPrompt]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @ResponseFormat nvarchar(20),
    @ModelSpecificResponseFormat nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @MinPowerRank int,
    @SelectionStrategy nvarchar(20),
    @PowerPreference nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100),
    @OutputType nvarchar(50),
    @OutputExample nvarchar(MAX),
    @ValidationBehavior nvarchar(50),
    @MaxRetries int,
    @RetryDelayMS int,
    @RetryStrategy nvarchar(20),
    @ResultSelectorPromptID uniqueidentifier,
    @EnableCaching bit,
    @CacheTTLSeconds int,
    @CacheMatchType nvarchar(20),
    @CacheSimilarityThreshold float(53),
    @CacheMustMatchModel bit,
    @CacheMustMatchVendor bit,
    @CacheMustMatchAgent bit,
    @CacheMustMatchConfig bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIPrompt]
        (
            [Name],
            [Description],
            [TemplateID],
            [CategoryID],
            [TypeID],
            [Status],
            [ResponseFormat],
            [ModelSpecificResponseFormat],
            [AIModelTypeID],
            [MinPowerRank],
            [SelectionStrategy],
            [PowerPreference],
            [ParallelizationMode],
            [ParallelCount],
            [ParallelConfigParam],
            [OutputType],
            [OutputExample],
            [ValidationBehavior],
            [MaxRetries],
            [RetryDelayMS],
            [RetryStrategy],
            [ResultSelectorPromptID],
            [EnableCaching],
            [CacheTTLSeconds],
            [CacheMatchType],
            [CacheSimilarityThreshold],
            [CacheMustMatchModel],
            [CacheMustMatchVendor],
            [CacheMustMatchAgent],
            [CacheMustMatchConfig]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @TemplateID,
            @CategoryID,
            @TypeID,
            @Status,
            @ResponseFormat,
            @ModelSpecificResponseFormat,
            @AIModelTypeID,
            @MinPowerRank,
            @SelectionStrategy,
            @PowerPreference,
            @ParallelizationMode,
            @ParallelCount,
            @ParallelConfigParam,
            @OutputType,
            @OutputExample,
            @ValidationBehavior,
            @MaxRetries,
            @RetryDelayMS,
            @RetryStrategy,
            @ResultSelectorPromptID,
            @EnableCaching,
            @CacheTTLSeconds,
            @CacheMatchType,
            @CacheSimilarityThreshold,
            @CacheMustMatchModel,
            @CacheMustMatchVendor,
            @CacheMustMatchAgent,
            @CacheMustMatchConfig
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPrompts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPrompt] TO [cdp_Developer]
    

/* spCreate Permissions for AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPrompt] TO [cdp_Developer]



/* spUpdate SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spUpdateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPrompt]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @ResponseFormat nvarchar(20),
    @ModelSpecificResponseFormat nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @MinPowerRank int,
    @SelectionStrategy nvarchar(20),
    @PowerPreference nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100),
    @OutputType nvarchar(50),
    @OutputExample nvarchar(MAX),
    @ValidationBehavior nvarchar(50),
    @MaxRetries int,
    @RetryDelayMS int,
    @RetryStrategy nvarchar(20),
    @ResultSelectorPromptID uniqueidentifier,
    @EnableCaching bit,
    @CacheTTLSeconds int,
    @CacheMatchType nvarchar(20),
    @CacheSimilarityThreshold float(53),
    @CacheMustMatchModel bit,
    @CacheMustMatchVendor bit,
    @CacheMustMatchAgent bit,
    @CacheMustMatchConfig bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPrompt]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [TemplateID] = @TemplateID,
        [CategoryID] = @CategoryID,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [ResponseFormat] = @ResponseFormat,
        [ModelSpecificResponseFormat] = @ModelSpecificResponseFormat,
        [AIModelTypeID] = @AIModelTypeID,
        [MinPowerRank] = @MinPowerRank,
        [SelectionStrategy] = @SelectionStrategy,
        [PowerPreference] = @PowerPreference,
        [ParallelizationMode] = @ParallelizationMode,
        [ParallelCount] = @ParallelCount,
        [ParallelConfigParam] = @ParallelConfigParam,
        [OutputType] = @OutputType,
        [OutputExample] = @OutputExample,
        [ValidationBehavior] = @ValidationBehavior,
        [MaxRetries] = @MaxRetries,
        [RetryDelayMS] = @RetryDelayMS,
        [RetryStrategy] = @RetryStrategy,
        [ResultSelectorPromptID] = @ResultSelectorPromptID,
        [EnableCaching] = @EnableCaching,
        [CacheTTLSeconds] = @CacheTTLSeconds,
        [CacheMatchType] = @CacheMatchType,
        [CacheSimilarityThreshold] = @CacheSimilarityThreshold,
        [CacheMustMatchModel] = @CacheMustMatchModel,
        [CacheMustMatchVendor] = @CacheMustMatchVendor,
        [CacheMustMatchAgent] = @CacheMustMatchAgent,
        [CacheMustMatchConfig] = @CacheMustMatchConfig
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPrompts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPrompt] TO [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIPrompt
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPrompt
ON [${flyway:defaultSchema}].[AIPrompt]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPrompt]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPrompt] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPrompt] TO [cdp_Developer]



/* spDelete SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer]
    

/* spDelete Permissions for AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer]


/* Base View SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: vwAIResultCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Result Cache
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIResultCache
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIResultCaches]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIResultCaches]
AS
SELECT
    a.*,
    AIPrompt_AIPromptID.[Name] AS [AIPrompt],
    AIModel_AIModelID.[Name] AS [AIModel],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIAgent_AgentID.[Name] AS [Agent],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIResultCache] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_AIPromptID
  ON
    [a].[AIPromptID] = AIPrompt_AIPromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_AIModelID
  ON
    [a].[AIModelID] = AIModel_AIModelID.[ID]
LEFT OUTER JOIN
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
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIResultCaches] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: Permissions for vwAIResultCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIResultCaches] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: spCreateAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIResultCache
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIResultCache]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIResultCache]
    @AIPromptID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @RunAt datetimeoffset,
    @PromptText nvarchar(MAX),
    @ResultText nvarchar(MAX),
    @Status nvarchar(50),
    @ExpiredOn datetimeoffset,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @PromptEmbedding varbinary,
    @PromptRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIResultCache]
        (
            [AIPromptID],
            [AIModelID],
            [RunAt],
            [PromptText],
            [ResultText],
            [Status],
            [ExpiredOn],
            [VendorID],
            [AgentID],
            [ConfigurationID],
            [PromptEmbedding],
            [PromptRunID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AIPromptID,
            @AIModelID,
            @RunAt,
            @PromptText,
            @ResultText,
            @Status,
            @ExpiredOn,
            @VendorID,
            @AgentID,
            @ConfigurationID,
            @PromptEmbedding,
            @PromptRunID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIResultCaches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
    

/* spCreate Permissions for AI Result Cache */




/* spUpdate SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: spUpdateAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIResultCache
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIResultCache]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIResultCache]
    @ID uniqueidentifier,
    @AIPromptID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @RunAt datetimeoffset,
    @PromptText nvarchar(MAX),
    @ResultText nvarchar(MAX),
    @Status nvarchar(50),
    @ExpiredOn datetimeoffset,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @PromptEmbedding varbinary,
    @PromptRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIResultCache]
    SET
        [AIPromptID] = @AIPromptID,
        [AIModelID] = @AIModelID,
        [RunAt] = @RunAt,
        [PromptText] = @PromptText,
        [ResultText] = @ResultText,
        [Status] = @Status,
        [ExpiredOn] = @ExpiredOn,
        [VendorID] = @VendorID,
        [AgentID] = @AgentID,
        [ConfigurationID] = @ConfigurationID,
        [PromptEmbedding] = @PromptEmbedding,
        [PromptRunID] = @PromptRunID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIResultCaches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIResultCache table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIResultCache
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIResultCache
ON [${flyway:defaultSchema}].[AIResultCache]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIResultCache]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIResultCache] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Result Cache */




/* spDelete SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: spDeleteAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIResultCache
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIResultCache]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIResultCache]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIResultCache]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for AI Result Cache */


/* Index for Foreign Keys for ConversationDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID ON [${flyway:defaultSchema}].[ConversationDetail] ([ConversationID]);

-- Index for foreign key UserID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_UserID ON [${flyway:defaultSchema}].[ConversationDetail] ([UserID]);

-- Index for foreign key ArtifactID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactID]);

-- Index for foreign key ArtifactVersionID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactVersionID]);

/* Index for Foreign Keys for Conversation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_UserID ON [${flyway:defaultSchema}].[Conversation] ([UserID]);

-- Index for foreign key LinkedEntityID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID ON [${flyway:defaultSchema}].[Conversation] ([LinkedEntityID]);

-- Index for foreign key DataContextID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_DataContextID ON [${flyway:defaultSchema}].[Conversation] ([DataContextID]);

/* Base View SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Conversation Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationDetails]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetails]
AS
SELECT
    c.*,
    Conversation_ConversationID.[Name] AS [Conversation],
    User_UserID.[Name] AS [User],
    ConversationArtifact_ArtifactID.[Name] AS [Artifact]
FROM
    [${flyway:defaultSchema}].[ConversationDetail] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [c].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS ConversationArtifact_ArtifactID
  ON
    [c].[ArtifactID] = ConversationArtifact_ArtifactID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: Permissions for vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spCreateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail]
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit,
    @UserRating int,
    @UserFeedback nvarchar(MAX),
    @ReflectionInsights nvarchar(MAX),
    @SummaryOfEarlierConversation nvarchar(MAX),
    @UserID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CompletionTime bigint
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ConversationDetail]
        (
            [ConversationID],
            [ExternalID],
            [Role],
            [Message],
            [Error],
            [HiddenToUser],
            [UserRating],
            [UserFeedback],
            [ReflectionInsights],
            [SummaryOfEarlierConversation],
            [UserID],
            [ArtifactID],
            [ArtifactVersionID],
            [CompletionTime]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ConversationID,
            @ExternalID,
            @Role,
            @Message,
            @Error,
            @HiddenToUser,
            @UserRating,
            @UserFeedback,
            @ReflectionInsights,
            @SummaryOfEarlierConversation,
            @UserID,
            @ArtifactID,
            @ArtifactVersionID,
            @CompletionTime
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spUpdate SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spUpdateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail]
    @ID uniqueidentifier,
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit,
    @UserRating int,
    @UserFeedback nvarchar(MAX),
    @ReflectionInsights nvarchar(MAX),
    @SummaryOfEarlierConversation nvarchar(MAX),
    @UserID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CompletionTime bigint
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        [ConversationID] = @ConversationID,
        [ExternalID] = @ExternalID,
        [Role] = @Role,
        [Message] = @Message,
        [Error] = @Error,
        [HiddenToUser] = @HiddenToUser,
        [UserRating] = @UserRating,
        [UserFeedback] = @UserFeedback,
        [ReflectionInsights] = @ReflectionInsights,
        [SummaryOfEarlierConversation] = @SummaryOfEarlierConversation,
        [UserID] = @UserID,
        [ArtifactID] = @ArtifactID,
        [ArtifactVersionID] = @ArtifactVersionID,
        [CompletionTime] = @CompletionTime
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationDetail
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationDetail
ON [${flyway:defaultSchema}].[ConversationDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spDelete Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]


/* Base View SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Conversations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Conversation
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversations]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversations]
AS
SELECT
    c.*,
    User_UserID.[Name] AS [User],
    Entity_LinkedEntityID.[Name] AS [LinkedEntity],
    DataContext_DataContextID.[Name] AS [DataContext]
FROM
    [${flyway:defaultSchema}].[Conversation] AS c
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_LinkedEntityID
  ON
    [c].[LinkedEntityID] = Entity_LinkedEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [c].[DataContextID] = DataContext_DataContextID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: Permissions for vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spCreateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Conversation
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversation]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversation]
    @UserID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordID nvarchar(500),
    @DataContextID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Conversation]
        (
            [UserID],
            [ExternalID],
            [Name],
            [Description],
            [Type],
            [IsArchived],
            [LinkedEntityID],
            [LinkedRecordID],
            [DataContextID],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @ExternalID,
            @Name,
            @Description,
            @Type,
            @IsArchived,
            @LinkedEntityID,
            @LinkedRecordID,
            @DataContextID,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spUpdate SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spUpdateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Conversation
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversation]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversation]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordID nvarchar(500),
    @DataContextID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        [UserID] = @UserID,
        [ExternalID] = @ExternalID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [IsArchived] = @IsArchived,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedRecordID] = @LinkedRecordID,
        [DataContextID] = @DataContextID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Conversation table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversation
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversation
ON [${flyway:defaultSchema}].[Conversation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Conversation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spDelete Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* Index for Foreign Keys for Dashboard */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_UserID ON [${flyway:defaultSchema}].[Dashboard] ([UserID]);

-- Index for foreign key CategoryID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_CategoryID ON [${flyway:defaultSchema}].[Dashboard] ([CategoryID]);

-- Index for foreign key ApplicationID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_ApplicationID ON [${flyway:defaultSchema}].[Dashboard] ([ApplicationID]);

/* Index for Foreign Keys for Report */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_CategoryID ON [${flyway:defaultSchema}].[Report] ([CategoryID]);

-- Index for foreign key UserID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_UserID ON [${flyway:defaultSchema}].[Report] ([UserID]);

-- Index for foreign key ConversationID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_ConversationID ON [${flyway:defaultSchema}].[Report] ([ConversationID]);

-- Index for foreign key ConversationDetailID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_ConversationDetailID ON [${flyway:defaultSchema}].[Report] ([ConversationDetailID]);

-- Index for foreign key DataContextID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_DataContextID ON [${flyway:defaultSchema}].[Report] ([DataContextID]);

-- Index for foreign key OutputTriggerTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputTriggerTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputTriggerTypeID ON [${flyway:defaultSchema}].[Report] ([OutputTriggerTypeID]);

-- Index for foreign key OutputFormatTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputFormatTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputFormatTypeID ON [${flyway:defaultSchema}].[Report] ([OutputFormatTypeID]);

-- Index for foreign key OutputDeliveryTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputDeliveryTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputDeliveryTypeID ON [${flyway:defaultSchema}].[Report] ([OutputDeliveryTypeID]);

-- Index for foreign key OutputWorkflowID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputWorkflowID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputWorkflowID ON [${flyway:defaultSchema}].[Report] ([OutputWorkflowID]);

/* Base View SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: vwDashboards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Dashboards
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Dashboard
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwDashboards]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboards]
AS
SELECT
    d.*,
    User_UserID.[Name] AS [User],
    DashboardCategory_CategoryID.[Name] AS [Category],
    Application_ApplicationID.[Name] AS [Application]
FROM
    [${flyway:defaultSchema}].[Dashboard] AS d
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DashboardCategory] AS DashboardCategory_CategoryID
  ON
    [d].[CategoryID] = DashboardCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Application] AS Application_ApplicationID
  ON
    [d].[ApplicationID] = Application_ApplicationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboards] TO [cdp_UI]
    

/* Base View Permissions SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: Permissions for vwDashboards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboards] TO [cdp_UI]

/* spCreate SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spCreateDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboard]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX),
    @Type nvarchar(20),
    @Thumbnail nvarchar(MAX),
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @DriverClass nvarchar(255),
    @Code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Dashboard]
        (
            [Name],
            [Description],
            [UserID],
            [CategoryID],
            [UIConfigDetails],
            [Type],
            [Thumbnail],
            [Scope],
            [ApplicationID],
            [DriverClass],
            [Code]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @UserID,
            @CategoryID,
            @UIConfigDetails,
            @Type,
            @Thumbnail,
            @Scope,
            @ApplicationID,
            @DriverClass,
            @Code
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboards] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboard] TO [cdp_UI]
    

/* spCreate Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboard] TO [cdp_UI]



/* spUpdate SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spUpdateDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboard]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX),
    @Type nvarchar(20),
    @Thumbnail nvarchar(MAX),
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @DriverClass nvarchar(255),
    @Code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dashboard]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID,
        [CategoryID] = @CategoryID,
        [UIConfigDetails] = @UIConfigDetails,
        [Type] = @Type,
        [Thumbnail] = @Thumbnail,
        [Scope] = @Scope,
        [ApplicationID] = @ApplicationID,
        [DriverClass] = @DriverClass,
        [Code] = @Code
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboards]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboard] TO [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Dashboard table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateDashboard
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboard
ON [${flyway:defaultSchema}].[Dashboard]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dashboard]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Dashboard] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboard] TO [cdp_UI]



/* spDelete SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spDeleteDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboard]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Dashboard]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboard] TO [cdp_UI]
    

/* spDelete Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboard] TO [cdp_UI]


/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);

/* Base View Permissions SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: Permissions for vwEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntity]
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Entity]
        (
            [ParentID],
            [Name],
            [NameSuffix],
            [Description],
            [AutoUpdateDescription],
            [BaseView],
            [BaseViewGenerated],
            [VirtualEntity],
            [TrackRecordChanges],
            [AuditRecordAccess],
            [AuditViewRuns],
            [IncludeInAPI],
            [AllowAllRowsAPI],
            [AllowUpdateAPI],
            [AllowCreateAPI],
            [AllowDeleteAPI],
            [CustomResolverAPI],
            [AllowUserSearchAPI],
            [FullTextSearchEnabled],
            [FullTextCatalog],
            [FullTextCatalogGenerated],
            [FullTextIndex],
            [FullTextIndexGenerated],
            [FullTextSearchFunction],
            [FullTextSearchFunctionGenerated],
            [UserViewMaxRows],
            [spCreate],
            [spUpdate],
            [spDelete],
            [spCreateGenerated],
            [spUpdateGenerated],
            [spDeleteGenerated],
            [CascadeDeletes],
            [DeleteType],
            [AllowRecordMerge],
            [spMatch],
            [RelationshipDefaultDisplayType],
            [UserFormGenerated],
            [EntityObjectSubclassName],
            [EntityObjectSubclassImport],
            [PreferredCommunicationField],
            [Icon],
            [ScopeDefault],
            [RowsToPackWithSchema],
            [RowsToPackSampleMethod],
            [RowsToPackSampleCount],
            [RowsToPackSampleOrder],
            [AutoRowCountFrequency],
            [RowCount],
            [RowCountRunAt],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ParentID,
            @Name,
            @NameSuffix,
            @Description,
            @AutoUpdateDescription,
            @BaseView,
            @BaseViewGenerated,
            @VirtualEntity,
            @TrackRecordChanges,
            @AuditRecordAccess,
            @AuditViewRuns,
            @IncludeInAPI,
            @AllowAllRowsAPI,
            @AllowUpdateAPI,
            @AllowCreateAPI,
            @AllowDeleteAPI,
            @CustomResolverAPI,
            @AllowUserSearchAPI,
            @FullTextSearchEnabled,
            @FullTextCatalog,
            @FullTextCatalogGenerated,
            @FullTextIndex,
            @FullTextIndexGenerated,
            @FullTextSearchFunction,
            @FullTextSearchFunctionGenerated,
            @UserViewMaxRows,
            @spCreate,
            @spUpdate,
            @spDelete,
            @spCreateGenerated,
            @spUpdateGenerated,
            @spDeleteGenerated,
            @CascadeDeletes,
            @DeleteType,
            @AllowRecordMerge,
            @spMatch,
            @RelationshipDefaultDisplayType,
            @UserFormGenerated,
            @EntityObjectSubclassName,
            @EntityObjectSubclassImport,
            @PreferredCommunicationField,
            @Icon,
            @ScopeDefault,
            @RowsToPackWithSchema,
            @RowsToPackSampleMethod,
            @RowsToPackSampleCount,
            @RowsToPackSampleOrder,
            @AutoRowCountFrequency,
            @RowCount,
            @RowCountRunAt,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [BaseView] = @BaseView,
        [BaseViewGenerated] = @BaseViewGenerated,
        [VirtualEntity] = @VirtualEntity,
        [TrackRecordChanges] = @TrackRecordChanges,
        [AuditRecordAccess] = @AuditRecordAccess,
        [AuditViewRuns] = @AuditViewRuns,
        [IncludeInAPI] = @IncludeInAPI,
        [AllowAllRowsAPI] = @AllowAllRowsAPI,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowCreateAPI] = @AllowCreateAPI,
        [AllowDeleteAPI] = @AllowDeleteAPI,
        [CustomResolverAPI] = @CustomResolverAPI,
        [AllowUserSearchAPI] = @AllowUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [FullTextCatalog] = @FullTextCatalog,
        [FullTextCatalogGenerated] = @FullTextCatalogGenerated,
        [FullTextIndex] = @FullTextIndex,
        [FullTextIndexGenerated] = @FullTextIndexGenerated,
        [FullTextSearchFunction] = @FullTextSearchFunction,
        [FullTextSearchFunctionGenerated] = @FullTextSearchFunctionGenerated,
        [UserViewMaxRows] = @UserViewMaxRows,
        [spCreate] = @spCreate,
        [spUpdate] = @spUpdate,
        [spDelete] = @spDelete,
        [spCreateGenerated] = @spCreateGenerated,
        [spUpdateGenerated] = @spUpdateGenerated,
        [spDeleteGenerated] = @spDeleteGenerated,
        [CascadeDeletes] = @CascadeDeletes,
        [DeleteType] = @DeleteType,
        [AllowRecordMerge] = @AllowRecordMerge,
        [spMatch] = @spMatch,
        [RelationshipDefaultDisplayType] = @RelationshipDefaultDisplayType,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [PreferredCommunicationField] = @PreferredCommunicationField,
        [Icon] = @Icon,
        [ScopeDefault] = @ScopeDefault,
        [RowsToPackWithSchema] = @RowsToPackWithSchema,
        [RowsToPackSampleMethod] = @RowsToPackSampleMethod,
        [RowsToPackSampleCount] = @RowsToPackSampleCount,
        [RowsToPackSampleOrder] = @RowsToPackSampleOrder,
        [AutoRowCountFrequency] = @AutoRowCountFrequency,
        [RowCount] = @RowCount,
        [RowCountRunAt] = @RowCountRunAt,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntity
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntity
ON [${flyway:defaultSchema}].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Entity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Entity]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]


/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EntityID ON [${flyway:defaultSchema}].[EntityField] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID ON [${flyway:defaultSchema}].[EntityField] ([RelatedEntityID]);

/* Base View Permissions SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntityField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField]
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10),
    @Status nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[EntityField]
        (
            [DisplayName],
            [Description],
            [AutoUpdateDescription],
            [IsPrimaryKey],
            [IsUnique],
            [Category],
            [ValueListType],
            [ExtendedType],
            [CodeType],
            [DefaultInView],
            [ViewCellTemplate],
            [DefaultColumnWidth],
            [AllowUpdateAPI],
            [AllowUpdateInView],
            [IncludeInUserSearchAPI],
            [FullTextSearchEnabled],
            [UserSearchParamFormatAPI],
            [IncludeInGeneratedForm],
            [GeneratedFormSection],
            [IsNameField],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IncludeRelatedEntityNameFieldInBaseView],
            [RelatedEntityNameFieldMap],
            [RelatedEntityDisplayType],
            [EntityIDFieldName],
            [ScopeDefault],
            [AutoUpdateRelatedEntityInfo],
            [ValuesToPackWithSchema],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @DisplayName,
            @Description,
            @AutoUpdateDescription,
            @IsPrimaryKey,
            @IsUnique,
            @Category,
            @ValueListType,
            @ExtendedType,
            @CodeType,
            @DefaultInView,
            @ViewCellTemplate,
            @DefaultColumnWidth,
            @AllowUpdateAPI,
            @AllowUpdateInView,
            @IncludeInUserSearchAPI,
            @FullTextSearchEnabled,
            @UserSearchParamFormatAPI,
            @IncludeInGeneratedForm,
            @GeneratedFormSection,
            @IsNameField,
            @RelatedEntityID,
            @RelatedEntityFieldName,
            @IncludeRelatedEntityNameFieldInBaseView,
            @RelatedEntityNameFieldMap,
            @RelatedEntityDisplayType,
            @EntityIDFieldName,
            @ScopeDefault,
            @AutoUpdateRelatedEntityInfo,
            @ValuesToPackWithSchema,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntityField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10),
    @Status nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType,
        [EntityIDFieldName] = @EntityIDFieldName,
        [ScopeDefault] = @ScopeDefault,
        [AutoUpdateRelatedEntityInfo] = @AutoUpdateRelatedEntityInfo,
        [ValuesToPackWithSchema] = @ValuesToPackWithSchema,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntityField
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityField
ON [${flyway:defaultSchema}].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntityField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityField]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]


/* Index for Foreign Keys for EntityRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([RelatedEntityID]);

-- Index for foreign key DisplayUserViewID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayUserViewID]);

-- Index for foreign key DisplayComponentID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayComponentID]);

/* Base View Permissions SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Permissions for vwEntityRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRelationships] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spCreateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntityRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship]
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[EntityRelationship]
        (
            [EntityID],
            [Sequence],
            [RelatedEntityID],
            [BundleInAPI],
            [IncludeInParentAllQuery],
            [Type],
            [EntityKeyField],
            [RelatedEntityJoinField],
            [JoinView],
            [JoinEntityJoinField],
            [JoinEntityInverseJoinField],
            [DisplayInForm],
            [DisplayLocation],
            [DisplayName],
            [DisplayIconType],
            [DisplayIcon],
            [DisplayComponentID],
            [DisplayComponentConfiguration],
            [AutoUpdateFromSchema]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @Sequence,
            @RelatedEntityID,
            @BundleInAPI,
            @IncludeInParentAllQuery,
            @Type,
            @EntityKeyField,
            @RelatedEntityJoinField,
            @JoinView,
            @JoinEntityJoinField,
            @JoinEntityInverseJoinField,
            @DisplayInForm,
            @DisplayLocation,
            @DisplayName,
            @DisplayIconType,
            @DisplayIcon,
            @DisplayComponentID,
            @DisplayComponentConfiguration,
            @AutoUpdateFromSchema
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spUpdateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntityRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [RelatedEntityID] = @RelatedEntityID,
        [BundleInAPI] = @BundleInAPI,
        [IncludeInParentAllQuery] = @IncludeInParentAllQuery,
        [Type] = @Type,
        [EntityKeyField] = @EntityKeyField,
        [RelatedEntityJoinField] = @RelatedEntityJoinField,
        [JoinView] = @JoinView,
        [JoinEntityJoinField] = @JoinEntityJoinField,
        [JoinEntityInverseJoinField] = @JoinEntityInverseJoinField,
        [DisplayInForm] = @DisplayInForm,
        [DisplayLocation] = @DisplayLocation,
        [DisplayName] = @DisplayName,
        [DisplayIconType] = @DisplayIconType,
        [DisplayIcon] = @DisplayIcon,
        [DisplayComponentID] = @DisplayComponentID,
        [DisplayComponentConfiguration] = @DisplayComponentConfiguration,
        [AutoUpdateFromSchema] = @AutoUpdateFromSchema
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityRelationship table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntityRelationship
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityRelationship
ON [${flyway:defaultSchema}].[EntityRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityRelationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spDeleteEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntityRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityRelationship]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]


/* Index for Foreign Keys for ListDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ListID in table ListDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ListDetail_ListID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ListDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ListDetail_ListID ON [${flyway:defaultSchema}].[ListDetail] ([ListID]);

/* Base View SQL for List Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: vwListDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      List Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ListDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwListDetails]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwListDetails]
AS
SELECT
    l.*,
    List_ListID.[Name] AS [List]
FROM
    [${flyway:defaultSchema}].[ListDetail] AS l
INNER JOIN
    [${flyway:defaultSchema}].[List] AS List_ListID
  ON
    [l].[ListID] = List_ListID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwListDetails] TO [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for List Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: Permissions for vwListDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwListDetails] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for List Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: spCreateListDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ListDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateListDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateListDetail]
    @ListID uniqueidentifier,
    @RecordID nvarchar(445),
    @Sequence int,
    @Status nvarchar(30),
    @AdditionalData nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ListDetail]
        (
            [ListID],
            [RecordID],
            [Sequence],
            [Status],
            [AdditionalData]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ListID,
            @RecordID,
            @Sequence,
            @Status,
            @AdditionalData
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwListDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListDetail] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for List Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListDetail] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for List Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: spUpdateListDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ListDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateListDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateListDetail]
    @ID uniqueidentifier,
    @ListID uniqueidentifier,
    @RecordID nvarchar(445),
    @Sequence int,
    @Status nvarchar(30),
    @AdditionalData nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListDetail]
    SET
        [ListID] = @ListID,
        [RecordID] = @RecordID,
        [Sequence] = @Sequence,
        [Status] = @Status,
        [AdditionalData] = @AdditionalData
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwListDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListDetail] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ListDetail table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateListDetail
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateListDetail
ON [${flyway:defaultSchema}].[ListDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ListDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for List Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListDetail] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for List Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Details
-- Item: spDeleteListDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ListDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteListDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteListDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ListDetail]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListDetail] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for List Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListDetail] TO [cdp_Integration], [cdp_Developer]


/* Base View SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: vwReports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Reports
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Report
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReports]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReports]
AS
SELECT
    r.*,
    ReportCategory_CategoryID.[Name] AS [Category],
    User_UserID.[Name] AS [User],
    Conversation_ConversationID.[Name] AS [Conversation],
    DataContext_DataContextID.[Name] AS [DataContext],
    OutputTriggerType_OutputTriggerTypeID.[Name] AS [OutputTriggerType],
    OutputFormatType_OutputFormatTypeID.[Name] AS [OutputFormatType],
    OutputDeliveryType_OutputDeliveryTypeID.[Name] AS [OutputDeliveryType],
    Workflow_OutputWorkflowID.[Name] AS [OutputWorkflow]
FROM
    [${flyway:defaultSchema}].[Report] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ReportCategory] AS ReportCategory_CategoryID
  ON
    [r].[CategoryID] = ReportCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [r].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [r].[DataContextID] = DataContext_DataContextID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputTriggerType] AS OutputTriggerType_OutputTriggerTypeID
  ON
    [r].[OutputTriggerTypeID] = OutputTriggerType_OutputTriggerTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputFormatType] AS OutputFormatType_OutputFormatTypeID
  ON
    [r].[OutputFormatTypeID] = OutputFormatType_OutputFormatTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputDeliveryType] AS OutputDeliveryType_OutputDeliveryTypeID
  ON
    [r].[OutputDeliveryTypeID] = OutputDeliveryType_OutputDeliveryTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Workflow] AS Workflow_OutputWorkflowID
  ON
    [r].[OutputWorkflowID] = Workflow_OutputWorkflowID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReports] TO [cdp_UI]
    

/* Base View Permissions SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: Permissions for vwReports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReports] TO [cdp_UI]

/* spCreate SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spCreateReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReport]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @SharingScope nvarchar(20),
    @ConversationID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID uniqueidentifier,
    @OutputFormatTypeID uniqueidentifier,
    @OutputDeliveryTypeID uniqueidentifier,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID uniqueidentifier,
    @Thumbnail nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Report]
        (
            [Name],
            [Description],
            [CategoryID],
            [UserID],
            [SharingScope],
            [ConversationID],
            [ConversationDetailID],
            [DataContextID],
            [Configuration],
            [OutputTriggerTypeID],
            [OutputFormatTypeID],
            [OutputDeliveryTypeID],
            [OutputFrequency],
            [OutputTargetEmail],
            [OutputWorkflowID],
            [Thumbnail]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @CategoryID,
            @UserID,
            @SharingScope,
            @ConversationID,
            @ConversationDetailID,
            @DataContextID,
            @Configuration,
            @OutputTriggerTypeID,
            @OutputFormatTypeID,
            @OutputDeliveryTypeID,
            @OutputFrequency,
            @OutputTargetEmail,
            @OutputWorkflowID,
            @Thumbnail
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReports] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReport] TO [cdp_UI]
    

/* spCreate Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReport] TO [cdp_UI]



/* spUpdate SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spUpdateReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReport]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @SharingScope nvarchar(20),
    @ConversationID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID uniqueidentifier,
    @OutputFormatTypeID uniqueidentifier,
    @OutputDeliveryTypeID uniqueidentifier,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID uniqueidentifier,
    @Thumbnail nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Report]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [UserID] = @UserID,
        [SharingScope] = @SharingScope,
        [ConversationID] = @ConversationID,
        [ConversationDetailID] = @ConversationDetailID,
        [DataContextID] = @DataContextID,
        [Configuration] = @Configuration,
        [OutputTriggerTypeID] = @OutputTriggerTypeID,
        [OutputFormatTypeID] = @OutputFormatTypeID,
        [OutputDeliveryTypeID] = @OutputDeliveryTypeID,
        [OutputFrequency] = @OutputFrequency,
        [OutputTargetEmail] = @OutputTargetEmail,
        [OutputWorkflowID] = @OutputWorkflowID,
        [Thumbnail] = @Thumbnail
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReports]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReport] TO [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Report table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateReport
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReport
ON [${flyway:defaultSchema}].[Report]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Report]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Report] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReport] TO [cdp_UI]



/* spDelete SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spDeleteReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReport]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ReportSnapshot
    DELETE FROM
        [${flyway:defaultSchema}].[ReportSnapshot]
    WHERE
        [ReportID] = @ID
    
    -- Cascade delete from ReportUserState
    DELETE FROM
        [${flyway:defaultSchema}].[ReportUserState]
    WHERE
        [ReportID] = @ID
    
    -- Cascade delete from ReportVersion
    DELETE FROM
        [${flyway:defaultSchema}].[ReportVersion]
    WHERE
        [ReportID] = @ID
    

    DELETE FROM
        [${flyway:defaultSchema}].[Report]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReport] TO [cdp_UI]
    

/* spDelete Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReport] TO [cdp_UI]


/* Index for Foreign Keys for UserView */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_UserID ON [${flyway:defaultSchema}].[UserView] ([UserID]);

-- Index for foreign key EntityID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_EntityID ON [${flyway:defaultSchema}].[UserView] ([EntityID]);

-- Index for foreign key CategoryID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_CategoryID ON [${flyway:defaultSchema}].[UserView] ([CategoryID]);

/* Base View Permissions SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: Permissions for vwUserViews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViews] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spCreateUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserView
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateUserView]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserView]
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @IsShared bit,
    @IsDefault bit,
    @GridState nvarchar(MAX),
    @FilterState nvarchar(MAX),
    @CustomFilterState bit,
    @SmartFilterEnabled bit,
    @SmartFilterPrompt nvarchar(MAX),
    @SmartFilterWhereClause nvarchar(MAX),
    @SmartFilterExplanation nvarchar(MAX),
    @WhereClause nvarchar(MAX),
    @CustomWhereClause bit,
    @SortState nvarchar(MAX),
    @Thumbnail nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[UserView]
        (
            [UserID],
            [EntityID],
            [Name],
            [Description],
            [CategoryID],
            [IsShared],
            [IsDefault],
            [GridState],
            [FilterState],
            [CustomFilterState],
            [SmartFilterEnabled],
            [SmartFilterPrompt],
            [SmartFilterWhereClause],
            [SmartFilterExplanation],
            [WhereClause],
            [CustomWhereClause],
            [SortState],
            [Thumbnail]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @EntityID,
            @Name,
            @Description,
            @CategoryID,
            @IsShared,
            @IsDefault,
            @GridState,
            @FilterState,
            @CustomFilterState,
            @SmartFilterEnabled,
            @SmartFilterPrompt,
            @SmartFilterWhereClause,
            @SmartFilterExplanation,
            @WhereClause,
            @CustomWhereClause,
            @SortState,
            @Thumbnail
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserViews] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spUpdateUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserView
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateUserView]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserView]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @IsShared bit,
    @IsDefault bit,
    @GridState nvarchar(MAX),
    @FilterState nvarchar(MAX),
    @CustomFilterState bit,
    @SmartFilterEnabled bit,
    @SmartFilterPrompt nvarchar(MAX),
    @SmartFilterWhereClause nvarchar(MAX),
    @SmartFilterExplanation nvarchar(MAX),
    @WhereClause nvarchar(MAX),
    @CustomWhereClause bit,
    @SortState nvarchar(MAX),
    @Thumbnail nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserView]
    SET
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [IsShared] = @IsShared,
        [IsDefault] = @IsDefault,
        [GridState] = @GridState,
        [FilterState] = @FilterState,
        [CustomFilterState] = @CustomFilterState,
        [SmartFilterEnabled] = @SmartFilterEnabled,
        [SmartFilterPrompt] = @SmartFilterPrompt,
        [SmartFilterWhereClause] = @SmartFilterWhereClause,
        [SmartFilterExplanation] = @SmartFilterExplanation,
        [WhereClause] = @WhereClause,
        [CustomWhereClause] = @CustomWhereClause,
        [SortState] = @SortState,
        [Thumbnail] = @Thumbnail
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserViews]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserView table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateUserView
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserView
ON [${flyway:defaultSchema}].[UserView]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserView]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserView] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spDeleteUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserView
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteUserView]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserView]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserView]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spDelete Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
